#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// Exposes the Swift RCTEventEmitter through the legacy native-module interop layer. This is the
// same bridge mode used by the Android IncomingCall module and remains available with RN's New
// Architecture enabled.
@interface RCT_EXTERN_MODULE(IncomingCall, RCTEventEmitter)

RCT_EXTERN_METHOD(presentIncomingCall:(NSString *)payloadJson)
RCT_EXTERN_METHOD(dismissIncomingCall)

RCT_EXTERN_METHOD(consumePendingAnswer:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(consumePendingHangup:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(drainCallMarkers:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(consumePendingMissedAction:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getVoipToken:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(canUseFullScreenIntent:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(openFullScreenIntentSettings)

@end
