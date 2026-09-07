/**
 * Tactical Mobile Haptic Feedback Engine
 * Utilizes navigator.vibrate with fallback for non-supporting devices.
 */

let hapticsEnabledState = true;

export function setHapticsEnabled(enabled: boolean) {
  hapticsEnabledState = enabled;
}

export function isHapticsEnabled(): boolean {
  return hapticsEnabledState;
}

export function hapticPttPress() {
  if (!hapticsEnabledState || typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    navigator.vibrate(28); // Short, firm tactile thud
  } catch (e) {
    // Ignore unsupported/blocked vibration
  }
}

export function hapticPttRelease() {
  if (!hapticsEnabledState || typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    navigator.vibrate(14); // Crisp detachment click
  } catch (e) {
    // Ignore
  }
}

export function hapticFloorGranted() {
  if (!hapticsEnabledState || typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    navigator.vibrate([20, 30, 45]); // Dual-pulse authorization cadence
  } catch (e) {
    // Ignore
  }
}

export function hapticFloorDenied() {
  if (!hapticsEnabledState || typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    navigator.vibrate([60, 40, 60]); // Distinct double rejection buzz
  } catch (e) {
    // Ignore
  }
}

export function hapticRotaryClick() {
  if (!hapticsEnabledState || typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    navigator.vibrate(10); // Micro mechanical notch detent tick
  } catch (e) {
    // Ignore
  }
}
