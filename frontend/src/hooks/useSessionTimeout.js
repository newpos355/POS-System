import { useEffect, useRef, useCallback } from 'react';

/**
 * useSessionTimeout
 *
 * Tracks user inactivity and auto-logs out after the configured idle duration.
 * Shows a 60-second warning countdown before logging out.
 *
 * @param {Function} onTimeout   - Called when the session times out (should call logout())
 * @param {Function} onWarn      - Called when 60s warning starts: receives (secondsLeft)
 * @param {Function} onWarnClear - Called when user resumes activity during the warning
 * @param {number}   idleMs      - Idle timeout in milliseconds (e.g. 30 * 60 * 1000)
 * @param {boolean}  enabled     - Set false to disable (e.g. when user is not logged in)
 */
const useSessionTimeout = ({ onTimeout, onWarn, onWarnClear, idleMs, enabled = true }) => {
  const idleTimer = useRef(null);
  const warnTimer = useRef(null);
  const countdownInterval = useRef(null);
  const isWarning = useRef(false);

  const WARN_BEFORE_MS = 60_000; // show warning 60 seconds before logout

  const clearAllTimers = useCallback(() => {
    if (idleTimer.current)        clearTimeout(idleTimer.current);
    if (warnTimer.current)        clearTimeout(warnTimer.current);
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    idleTimer.current = null;
    warnTimer.current = null;
    countdownInterval.current = null;
  }, []);

  const startCountdown = useCallback(() => {
    let secondsLeft = Math.ceil(WARN_BEFORE_MS / 1000);
    onWarn?.(secondsLeft);
    countdownInterval.current = setInterval(() => {
      secondsLeft -= 1;
      onWarn?.(secondsLeft);
      if (secondsLeft <= 0) {
        clearInterval(countdownInterval.current);
      }
    }, 1000);
  }, [onWarn]);

  const resetTimer = useCallback(() => {
    if (!enabled) return;

    // If we were in the warning phase and the user came back, clear the warning
    if (isWarning.current) {
      isWarning.current = false;
      onWarnClear?.();
    }

    clearAllTimers();

    // Effective idle time before warning = idleMs - WARN_BEFORE_MS
    const timeBeforeWarn = Math.max(idleMs - WARN_BEFORE_MS, 0);

    // Set warning timer
    warnTimer.current = setTimeout(() => {
      isWarning.current = true;
      startCountdown();

      // Set logout timer (fires WARN_BEFORE_MS after the warning)
      idleTimer.current = setTimeout(() => {
        clearAllTimers();
        isWarning.current = false;
        onTimeout?.();
      }, WARN_BEFORE_MS);
    }, timeBeforeWarn);
  }, [enabled, idleMs, onTimeout, onWarnClear, startCountdown, clearAllTimers]);

  useEffect(() => {
    if (!enabled) return;

    const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

    const handleActivity = () => resetTimer();

    EVENTS.forEach(ev => window.addEventListener(ev, handleActivity, { passive: true }));

    // Start the timer immediately on mount
    resetTimer();

    return () => {
      EVENTS.forEach(ev => window.removeEventListener(ev, handleActivity));
      clearAllTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, idleMs]);

  return { resetTimer };
};

export default useSessionTimeout;
