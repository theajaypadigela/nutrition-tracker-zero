import AVFoundation
import React
import UIKit

/// Provider-independent duplex PCM transport with voice processing and native phone routes.
@objc(VoicePcm)
final class VoicePcmModule: RCTEventEmitter {
  private var engine: AVAudioEngine?
  private var player: AVAudioPlayerNode?
  private var muted = false
  private var inputRate = 16000.0
  private var outputRate = 24000.0
  private var pending = 0
  private var playbackGeneration = 0
  private let lock = NSLock()
  private var observers: [NSObjectProtocol] = []
  private var tapped = false
  override static func requiresMainQueueSetup() -> Bool { true }
  override var methodQueue: DispatchQueue! { DispatchQueue.main }
  override func supportedEvents() -> [String]! { ["VoicePcmInput", "VoicePcmError", "VoicePcmRoute"] }

  @objc(start:outputRate:resolver:rejecter:)
  func start(_ input: Double, outputRate output: Double, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    stop()
    do {
      inputRate = input; outputRate = output; muted = false
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
      try session.setActive(true)
      let e = AVAudioEngine()
      engine = e
      try e.inputNode.setVoiceProcessingEnabled(true)
      let p = AVAudioPlayerNode()
      player = p
      e.attach(p)
      let format = AVAudioFormat(standardFormatWithSampleRate: outputRate, channels: 1)!
      e.connect(p, to: e.mainMixerNode, format: format)
      try installTap(e)
      try e.start()
      p.play()
      UIDevice.current.isProximityMonitoringEnabled = true
      let center = NotificationCenter.default
      observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: session, queue: .main) { [weak self] _ in
        guard let self, self.engine != nil else { return }
        // AudioEngine reconfigures hardware on route changes. Rebuild the resampler against its current format.
        do { if let e = self.engine { try self.installTap(e); if !e.isRunning { try e.start() } }; self.emitRoute() }
        catch { self.sendEvent(withName: "VoicePcmError", body: "The audio route could not continue") }
      })
      observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: session, queue: .main) { [weak self] event in
        if let type = event.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt, type == AVAudioSession.InterruptionType.began.rawValue {
          self?.sendEvent(withName: "VoicePcmError", body: "Another call interrupted the microphone")
        }
      })
      emitRoute()
      resolve(nil)
    } catch { stop(); reject("voice_audio", "Could not start voice audio: \(error.localizedDescription)", error) }
  }

  private func installTap(_ e: AVAudioEngine) throws {
    let input = e.inputNode
    if tapped { input.removeTap(onBus: 0); tapped = false }
    let source = input.outputFormat(forBus: 0)
    guard source.sampleRate > 0, let target = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: inputRate, channels: 1, interleaved: true),
          let converter = AVAudioConverter(from: source, to: target) else { throw NSError(domain: "VoicePcm", code: 1) }
    input.installTap(onBus: 0, bufferSize: 1024, format: source) { [weak self] buffer, _ in
      guard let self else { return }
      let capacity = AVAudioFrameCount(ceil(Double(buffer.frameLength) * self.inputRate / source.sampleRate) + 16)
      guard let result = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }
      var supplied = false
      var error: NSError?
      converter.convert(to: result, error: &error) { _, status in
        if supplied { status.pointee = .noDataNow; return nil }
        supplied = true; status.pointee = .haveData; return buffer
      }
      guard error == nil, let samples = result.int16ChannelData, result.frameLength > 0 else { return }
      let data = Data(bytes: samples[0], count: Int(result.frameLength) * 2)
      DispatchQueue.main.async { [weak self] in
        guard let self, self.engine === e, !self.muted else { return }
        self.sendEvent(withName: "VoicePcmInput", body: data.base64EncodedString())
      }
    }
    tapped = true
  }

  @objc func play(_ base64: String) {
    guard let p = player, let bytes = Data(base64Encoded: base64), bytes.count >= 2,
          let format = AVAudioFormat(standardFormatWithSampleRate: outputRate, channels: 1),
          let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(bytes.count / 2)),
          let channel = buffer.floatChannelData?[0] else { return }
    buffer.frameLength = buffer.frameCapacity
    bytes.withUnsafeBytes { raw in
      let b = raw.bindMemory(to: UInt8.self)
      for i in 0..<Int(buffer.frameLength) { channel[i] = Float(Int16(bitPattern: UInt16(b[i * 2]) | (UInt16(b[i * 2 + 1]) << 8))) / 32768.0 }
    }
    lock.lock(); pending += 1; let generation = playbackGeneration; lock.unlock()
    p.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
      guard let self else { return }
      self.lock.lock(); if self.playbackGeneration == generation { self.pending = max(0, self.pending - 1) }; self.lock.unlock()
    }
    if !p.isPlaying { p.play() }
  }

  @objc func clear() {
    lock.lock(); playbackGeneration += 1; pending = 0; lock.unlock()
    player?.stop()
    if engine?.isRunning == true { player?.play() }
  }

  @objc(drain:rejecter:)
  func drain(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    let deadline = Date().addingTimeInterval(8)
    func check() {
      self.lock.lock(); let count = self.pending; self.lock.unlock()
      if count == 0 || self.engine == nil || Date() >= deadline { resolve(nil) }
      else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.02, execute: check) }
    }
    check()
  }

  @objc func setMuted(_ value: Bool) { muted = value }
  @objc(getState:rejecter:)
  func getState(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) { resolve(state()) }
  @objc(setRoute:resolver:rejecter:)
  func setRoute(_ route: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    do {
      let session = AVAudioSession.sharedInstance()
      if route == "speaker" { try session.overrideOutputAudioPort(.speaker) }
      else {
        try session.overrideOutputAudioPort(.none)
        let ports = session.availableInputs ?? []
        let desired = ports.first { port in
          switch route { case "bluetooth": return port.portType == .bluetoothHFP
          case "wired": return port.portType == .headsetMic
          default: return port.portType == .builtInMic }
        }
        try session.setPreferredInput(desired)
      }
      UIDevice.current.isProximityMonitoringEnabled = route == "earpiece"
      resolve(state()); emitRoute()
    } catch { reject("voice_route", error.localizedDescription, error) }
  }

  private func state() -> [String: Any] {
    let session = AVAudioSession.sharedInstance()
    let outputs = session.currentRoute.outputs
    let bluetooth = outputs.contains { [.bluetoothHFP, .bluetoothA2DP, .bluetoothLE].contains($0.portType) }
    let wired = outputs.contains { [.headphones, .usbAudio].contains($0.portType) }
    let speaker = outputs.contains { $0.portType == .builtInSpeaker }
    let route = bluetooth ? "bluetooth" : wired ? "wired" : speaker ? "speaker" : "earpiece"
    var available = ["earpiece", "speaker"]
    if wired { available.append("wired") }
    if bluetooth || (session.availableInputs ?? []).contains(where: { $0.portType == .bluetoothHFP }) { available.append("bluetooth") }
    UIDevice.current.isProximityMonitoringEnabled = engine != nil && route == "earpiece"
    return ["route": route, "available": available, "proximity": true, "near": UIDevice.current.proximityState]
  }
  private func emitRoute() { sendEvent(withName: "VoicePcmRoute", body: state()) }

  @objc func stop() {
    observers.forEach { NotificationCenter.default.removeObserver($0) }; observers.removeAll()
    if let e = engine { if tapped { e.inputNode.removeTap(onBus: 0) }; e.stop() }
    tapped = false; engine = nil; player?.stop(); player = nil
    lock.lock(); playbackGeneration += 1; pending = 0; lock.unlock()
    UIDevice.current.isProximityMonitoringEnabled = false
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
  override func invalidate() { DispatchQueue.main.async { self.stop() }; super.invalidate() }
}
