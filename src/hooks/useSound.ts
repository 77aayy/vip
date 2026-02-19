import { useCallback, useEffect, useRef } from 'react'

export function useSound() {
  const audioContext = useRef<AudioContext | null>(null)
  const tickIntervalId = useRef<ReturnType<typeof setInterval> | null>(null)

  const playWin = useCallback(() => {
    try {
      const ctx = audioContext.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      if (!audioContext.current) audioContext.current = ctx
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(523.25, ctx.currentTime)
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1)
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2)
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.4)
    } catch {
      // ignore
    }
  }, [])

  const playTick = useCallback(() => {
    try {
      const ctx = audioContext.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      if (!audioContext.current) audioContext.current = ctx
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(800, ctx.currentTime)
      gain.gain.setValueAtTime(0.24, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.05)
    } catch {
      // ignore
    }
  }, [])

  const playSuccess = useCallback(() => {
    try {
      const ctx = audioContext.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      if (!audioContext.current) audioContext.current = ctx
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(523.25, ctx.currentTime)
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08)
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.16)
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.24)
      gain.gain.setValueAtTime(0.12, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
    } catch {
      // ignore
    }
  }, [])

  const playCelebration = useCallback(() => {
    try {
      const ctx = audioContext.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      if (!audioContext.current) audioContext.current = ctx
      const times = [0, 0.06, 0.12, 0.18, 0.24, 0.3]
      const freqs = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5]
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      times.forEach((t, i) => osc.frequency.setValueAtTime(freqs[i], ctx.currentTime + t))
      gain.gain.setValueAtTime(0.14, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.55)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.55)
    } catch {
      // ignore
    }
  }, [])

  const startSpinningSound = useCallback(() => {
    stopSpinningSound()
    tickIntervalId.current = setInterval(() => {
      playTick()
    }, 90)
  }, [playTick])

  const stopSpinningSound = useCallback(() => {
    if (tickIntervalId.current !== null) {
      clearInterval(tickIntervalId.current)
      tickIntervalId.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      stopSpinningSound()
    }
  }, [stopSpinningSound])

  return { playWin, playTick, playSuccess, playCelebration, startSpinningSound, stopSpinningSound }
}
