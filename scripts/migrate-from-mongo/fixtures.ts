/** Sample old-app documents covering the edge cases the transform handles. */
export const sample = {
  users: [
    { _id: 'u1', name: 'Asha', email: 'asha@example.com', timezone: 'Asia/Kolkata', createdAt: new Date('2026-01-01T00:00:00Z') },
    { _id: 'u2', name: 'asha', email: 'other@example.com' },
    { _id: 'u3', name: '', email: 'ravi.k@example.com' },
  ],
  schedules: [
    { userId: 'u1', hour: 20, minute: 5, enabled: true, timezone: 'Asia/Kolkata' },
    { userId: 'u3', hour: 7, minute: 0, enabled: false, timezone: 'Not/AZone' },
  ],
  logs: [
    { _id: 'l1', userId: 'u1', logDate: new Date('2026-09-30T00:00:00Z') },
    { _id: 'l2', userId: 'u1', logDate: new Date('2026-09-29T18:30:00Z') }, // IST midnight of 09-30: same day, merged
    { _id: 'l3', userId: 'u3', logDate: '2026-09-28' },
    { _id: 'l4', userId: 'ghost', logDate: new Date('2026-09-28T00:00:00Z') },
  ],
  entries: [
    { _id: 'e1', foodLogId: 'l1', mealType: 'Breakfast', name: 'Idlis', quantity: 3, unit: 'pieces' },
    { _id: 'e2', foodLogId: 'l2', mealType: 'supper', name: "Mom's  dal", quantity: 1, unit: 'katoris' },
    { _id: 'e3', foodLogId: 'l3', mealType: null, name: 'chai', quantity: 0, unit: 'cup' },
    { _id: 'e4', foodLogId: 'l4', name: 'x', quantity: 1, unit: 'g' },
    { _id: 'e5', foodLogId: 'l3', mealType: 'brunch', name: 'Poha', quantity: 1.5, unit: '' },
  ],
  preferences: [
    { userId: 'u1', nutrientId: 'protein', customTarget: 120 },
    { userId: 'u1', nutrientId: 'pinnedOnly', customTarget: null },
    { userId: 'u3', nutrientId: 'iron', customTarget: 18 },
  ],
};
