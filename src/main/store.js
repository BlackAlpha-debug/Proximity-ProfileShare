import Store from 'electron-store'

// Single shared electron-store instance (persists to a JSON file in userData).
// Keys: "deviceId", "myProfile", "contacts", "onboardingPermissionsShown".
export const store = new Store()
