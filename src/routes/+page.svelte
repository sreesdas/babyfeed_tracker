<script lang="ts">
  import { onMount } from 'svelte';
  import { getItem, setItem, removeItem } from '$lib/storage.js';
  import { uuid } from '$lib/utils.js';

  type Session = {
    id: string;
    startTime: number;
    endTime: number;
    duration: number; // in seconds
    side: 'L' | 'R';
  };

  let sessions = $state<Session[]>([]);
  let feedingStartTime = $state<number | null>(null); // the original start timestamp
  let resumeTime = $state<number | null>(null); // when the current running segment began
  let accumulatedSeconds = $state(0); // total seconds accumulated from previous segments (before pauses)
  let elapsedTime = $state(0); // display value
  let isPaused = $state(false);
  let selectedSide = $state<'L' | 'R'>('R');
  let intervalId: number | ReturnType<typeof setInterval> | null = null;

  // Determine if a feeding is in progress (running OR paused)
  let isTracking = $derived(feedingStartTime !== null);
  
  let dataLoaded = $state(false);

  onMount(async () => {
    const stored = await getItem('feedingSessions');
    if (stored) {
      sessions = stored;
    }
    // Restore an active feeding session
    const savedState = await getItem('currentFeedingState');
    if (savedState) {
      feedingStartTime = savedState.feedingStartTime;
      accumulatedSeconds = savedState.accumulatedSeconds;
      isPaused = savedState.isPaused;
      selectedSide = savedState.selectedSide ?? 'R';
      if (isPaused) {
        elapsedTime = accumulatedSeconds;
      } else {
        resumeTime = savedState.resumeTime;
        elapsedTime = accumulatedSeconds + Math.floor((Date.now() - (resumeTime ?? Date.now())) / 1000);
        startInterval();
      }
    }
    dataLoaded = true;
  });

  $effect(() => {
    // Only persist after initial load to avoid overwriting with empty state
    if (!dataLoaded) return;

    if (sessions.length > 0) {
      setItem('feedingSessions', sessions);
    }
    // Persist active feeding state
    if (feedingStartTime) {
      setItem('currentFeedingState', {
        feedingStartTime,
        resumeTime,
        accumulatedSeconds,
        isPaused,
        selectedSide
      });
    } else {
      removeItem('currentFeedingState');
    }
  });

  let groupedSessions = $derived.by(() => {
    const groups: Record<string, Session[]> = {};
    for (const session of sessions) {
      const date = new Date(session.startTime).toLocaleDateString([], { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(session);
    }
    const sortedDates = Object.keys(groups);
    return sortedDates.map(date => ({
      date,
      totalDuration: groups[date].reduce((acc, curr) => acc + curr.duration, 0),
      sessions: groups[date]
    }));
  });

  function startInterval() {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(() => {
      if (resumeTime) {
        elapsedTime = accumulatedSeconds + Math.floor((Date.now() - resumeTime) / 1000);
      }
    }, 1000);
  }

  function stopInterval() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function startFeeding() {
    feedingStartTime = Date.now();
    resumeTime = Date.now();
    accumulatedSeconds = 0;
    elapsedTime = 0;
    isPaused = false;
    startInterval();
  }

  function pauseFeeding() {
    // Freeze the current running segment into accumulated
    if (resumeTime) {
      accumulatedSeconds += Math.floor((Date.now() - resumeTime) / 1000);
    }
    elapsedTime = accumulatedSeconds;
    resumeTime = null;
    isPaused = true;
    stopInterval();
  }

  function resumeFeeding() {
    resumeTime = Date.now();
    isPaused = false;
    startInterval();
  }

  function endFeeding() {
    if (feedingStartTime) {
      const endTime = Date.now();
      // If running, add the current segment; if paused, use accumulated
      let duration = accumulatedSeconds;
      if (!isPaused && resumeTime) {
        duration += Math.floor((Date.now() - resumeTime) / 1000);
      }
      
      const newSession: Session = {
        id: uuid(),
        startTime: feedingStartTime,
        endTime,
        duration,
        side: selectedSide
      };
      
      sessions = [newSession, ...sessions];
      feedingStartTime = null;
      resumeTime = null;
      accumulatedSeconds = 0;
      elapsedTime = 0;
      isPaused = false;
      stopInterval();
    }
  }

  function formatDuration(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function formatTimerDisplay(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  
  function formatTime(timestamp: number) {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="tracker-container">
  <div class="header">
    <h1>🍼 Baby Tracker</h1>
    <p>Track your little one's feeding times easily.</p>
  </div>

  <div class="timer-section">
    <div class="timer-status">
      {#if isTracking && !isPaused}
        <span class="status-dot running"></span> Running
      {:else if isTracking && isPaused}
        <span class="status-dot paused"></span> Paused
      {:else}
        <span class="status-dot idle"></span> Ready
      {/if}
    </div>

    <div class="time-display" class:active={isTracking && !isPaused} class:paused={isPaused}>
      {formatTimerDisplay(elapsedTime)}
    </div>

    <div class="side-selector" class:disabled={isTracking}>
      <button
        class="side-btn"
        class:active={selectedSide === 'L'}
        disabled={isTracking}
        onclick={() => selectedSide = 'L'}
      >L</button>
      <button
        class="side-btn"
        class:active={selectedSide === 'R'}
        disabled={isTracking}
        onclick={() => selectedSide = 'R'}
      >R</button>
    </div>

    <div class="controls">
      {#if !isTracking}
        <button class="btn btn-start" onclick={startFeeding}>
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          Start
        </button>
      {:else}
        {#if isPaused}
          <button class="btn btn-resume" onclick={resumeFeeding}>
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            Resume
          </button>
        {:else}
          <button class="btn btn-pause" onclick={pauseFeeding}>
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
            Pause
          </button>
        {/if}
        <button class="btn btn-end" onclick={endFeeding}>
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
          End
        </button>
      {/if}
    </div>
  </div>

  <div class="history-section">
    <h2>Recent Feedings</h2>
    {#if sessions.length === 0}
      <div class="empty-state">
        <div class="empty-icon">🍼</div>
        <p>No feeding sessions recorded yet.</p>
      </div>
    {:else}
      <div class="session-list">
        {#each groupedSessions as group (group.date)}
          <div class="date-group">
            <div class="date-header">
              <h3>{group.date}</h3>
              <span class="daily-total">{formatDuration(group.totalDuration)}</span>
            </div>
            
            <ul class="sessions-for-date">
              {#each group.sessions as session (session.id)}
                <li class="session-card">
                  <div class="session-side-badge" class:side-left={session.side === 'L'}>{session.side ?? '?'}</div>
                  <div class="session-details">
                    <div class="session-times">
                      <span>{formatTime(session.startTime)}</span>
                      <span class="separator">→</span>
                      <span>{formatTime(session.endTime)}</span>
                    </div>
                  </div>
                  <div class="duration">{formatDuration(session.duration)}</div>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .tracker-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 2.5rem 2rem;
  }

  .header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .header h1 {
    font-size: 2.2rem;
    color: var(--primary-hover);
    margin-bottom: 0.5rem;
  }

  .header p {
    color: var(--text-muted);
    font-size: 1.05rem;
  }

  .timer-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: white;
    padding: 3rem 1.5rem;
    border-radius: 36px;
    box-shadow: 0 10px 25px -5px rgba(255, 158, 187, 0.2);
    margin-bottom: 2.5rem;
    border: 3px solid #FFF0F5;
  }

  .time-display {
    font-family: 'Fredoka', 'Fira Mono', monospace;
    font-size: 5rem;
    color: var(--text-main);
    letter-spacing: -2px;
    margin-bottom: 2.5rem;
    font-variant-numeric: tabular-nums;
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .time-display.active {
    color: var(--primary-hover);
    transform: scale(1.05);
    text-shadow: 0 0 30px rgba(255, 158, 187, 0.4);
  }

  .side-selector {
    display: flex;
    gap: 0;
    margin-bottom: 1.5rem;
    background: #F1F5F9;
    border-radius: 100px;
    padding: 4px;
    transition: opacity 0.3s ease;
  }

  .side-selector.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .side-btn {
    padding: 0.65rem 2rem;
    font-size: 1.2rem;
    font-weight: 700;
    border-radius: 100px;
    background: transparent;
    color: var(--text-muted);
    border: none;
    cursor: pointer;
    transition: all 0.25s ease;
    letter-spacing: 0.05em;
  }

  .side-btn.active {
    background: var(--primary-hover);
    color: white;
    box-shadow: 0 4px 12px rgba(255, 158, 187, 0.4);
  }

  .side-btn:not(.active):hover {
    background: #E2E8F0;
    color: var(--text-main);
  }

  .controls {
    display: flex;
    gap: 1rem;
    width: 100%;
    max-width: 400px;
  }

  .btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1.25rem 2rem;
    font-size: 1.35rem;
    border-radius: 100px;
    color: #4A4A4A;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.06);
    background-color: var(--success);
  }

  .btn-start {
    background-color: var(--success);
    color: #1e5c46;
  }

  .btn-start:hover {
    background-color: var(--success-hover);
    transform: translateY(-3px);
    box-shadow: 0 12px 24px rgba(168, 230, 207, 0.6);
  }

  .btn-end {
    background-color: var(--danger);
    color: #8c2a2a;
  }

  .btn-end:hover {
    background-color: var(--danger-hover);
    transform: translateY(-3px);
    box-shadow: 0 12px 24px rgba(255, 160, 160, 0.6);
  }

  .timer-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
  }

  .status-dot.running {
    background: var(--success);
    box-shadow: 0 0 8px rgba(168, 230, 207, 0.8);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .status-dot.paused {
    background: #FBBF24;
    box-shadow: 0 0 8px rgba(251, 191, 36, 0.5);
  }

  .status-dot.idle {
    background: #CBD5E1;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.3); }
  }

  .time-display.paused {
    color: #FBBF24;
    animation: blink 1.2s ease-in-out infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .btn-pause {
    background-color: #FBBF24;
    color: #78350F;
  }

  .btn-pause:hover {
    background-color: #F59E0B;
    transform: translateY(-3px);
    box-shadow: 0 12px 24px rgba(251, 191, 36, 0.4);
  }

  .btn-resume {
    background-color: var(--secondary);
    color: #0C4A6E;
  }

  .btn-resume:hover {
    background-color: #7DD3FC;
    transform: translateY(-3px);
    box-shadow: 0 12px 24px rgba(160, 222, 255, 0.6);
  }

  .icon {
    width: 24px;
    height: 24px;
  }

  .history-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .history-section h2 {
    font-size: 1.5rem;
    color: var(--secondary);
    margin-bottom: 1.25rem;
    padding-left: 0.5rem;
    text-shadow: 1px 1px 0px rgba(0,0,0,0.05);
  }

  .session-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .date-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .date-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 0.5rem;
    border-bottom: 2px dashed var(--border);
    padding-bottom: 0.5rem;
  }

  .date-header h3 {
    font-size: 1.2rem;
    color: var(--text-main);
  }

  .daily-total {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--primary-hover);
    background: #FFF0F5;
    padding: 0.25rem 0.75rem;
    border-radius: 100px;
  }

  .sessions-for-date {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .session-card {
    background: white;
    padding: 1.25rem;
    border-radius: 20px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.03);
    border: 2px solid #fcfcfc;
    display: flex;
    align-items: center;
    gap: 1rem;
    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  }

  .session-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(160, 222, 255, 0.15);
    border-color: #E0F7FA;
  }

  .session-side-badge {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.95rem;
    background: #E0F7FA;
    color: #008394;
    flex-shrink: 0;
  }

  .session-side-badge.side-left {
    background: #FFF0F5;
    color: var(--primary-hover);
  }

  .session-details {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .session-times {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    color: var(--text-main);
    font-size: 1.05rem;
  }

  .separator {
    opacity: 0.4;
  }

  .duration {
    background: #E0F7FA;
    padding: 0.4rem 0.8rem;
    border-radius: 100px;
    font-size: 0.95rem;
    font-weight: 700;
    color: #008394;
  }

  .empty-state {
    text-align: center;
    padding: 4rem 1rem;
    color: var(--text-muted);
    background: rgba(255,255,255,0.6);
    border-radius: 24px;
    border: 2px dashed var(--border);
  }

  .empty-icon {
    font-size: 3.5rem;
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  /* Custom Scrollbar */
  .session-list::-webkit-scrollbar {
    width: 6px;
  }
  .session-list::-webkit-scrollbar-track {
    background: transparent;
  }
  .session-list::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 10px;
  }
  .session-list::-webkit-scrollbar-thumb:hover {
    background: var(--primary);
  }
</style>
