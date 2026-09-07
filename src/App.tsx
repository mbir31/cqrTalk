import React, { useState, useEffect, useRef } from 'react';
import { useWalkieTalkie } from './hooks/useWalkieTalkie';
import { HomeScreen } from './components/HomeScreen';
import { CommunicationScreen } from './components/CommunicationScreen';
import { CreateSessionModal } from './components/CreateSessionModal';
import { JoinModal } from './components/JoinModal';
import { SettingsModal } from './components/SettingsModal';
import { SessionType } from './types';

export default function App() {
  const {
    displayName,
    setDisplayName,
    soundEffects,
    setSoundEffects,
    hapticsEnabled,
    setHapticsEnabled,
    rfFilterEnabled,
    setRfFilterEnabled,
    squelchTailEnabled,
    setSquelchTailEnabled,
    rogerBeepEnabled,
    setRogerBeepEnabled,
    rogerBeepStyle,
    setRogerBeepStyle,
    activeChannel,
    setActiveChannel,
    transmissionHistory,
    speakerMuted,
    toggleSpeakerMute,
    participantId,
    session,
    connectionState,
    rssi,
    txRxState,
    floor,
    errorMessage,
    setErrorMessage,
    micPermissionDenied,
    requestMicrophonePermission,
    leaseSecondsLeft,
    micVolume,
    joinSession,
    leaveSession,
    requestFloor,
    releaseFloor,
    toggleFloor,
    removeParticipant,
    endSession,
    getAudioFrequencyData,
    getAudioTimeDomainData,
    startMicCheck,
    stopMicCheckAndPlay,
    cancelMicCheck,
    getMicVolumeLevel
  } = useWalkieTalkie();

  const [createModalType, setCreateModalType] = useState<SessionType | null>(null);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [initialJoinPin, setInitialJoinPin] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const hasProcessedUrlRef = useRef(false);

  // Online / offline window state
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Screen Wake Lock while session is active to prevent audio sleep
  useEffect(() => {
    let wakeLock: any = null;
    if (session && 'wakeLock' in navigator) {
      (navigator as any).wakeLock.request('screen').then((lock: any) => {
        wakeLock = lock;
      }).catch(() => {});
    }
    return () => {
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, [session]);

  // Check URL query parameters for ?pin= or ?session= on initial load only
  useEffect(() => {
    if (hasProcessedUrlRef.current) return;
    hasProcessedUrlRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const pin = params.get('pin');
    const sessionId = params.get('session');

    if (pin) {
      setInitialJoinPin(pin);
      setIsJoinModalOpen(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (sessionId) {
      // Re-attach the creator token if this tab created the session earlier
      let hostToken: string | undefined;
      try {
        hostToken = sessionStorage.getItem(`cqrtalk_host_token_${sessionId}`) || undefined;
      } catch (err) {
        // Storage unavailable
      }
      joinSession(sessionId, hostToken);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [joinSession]);

  const handleSessionCreated = (sessionId: string, hostToken?: string) => {
    setCreateModalType(null);
    joinSession(sessionId, hostToken);
  };

  const handleJoinFromPin = (sessionId: string) => {
    setIsJoinModalOpen(false);
    joinSession(sessionId);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-between p-2 sm:p-4 sm:py-6 selection:bg-emerald-500 selection:text-slate-950">
      {/* Active Communication View or Home Panel */}
      {session ? (
        <CommunicationScreen
          session={session}
          connectionState={connectionState}
          txRxState={txRxState}
          floor={floor}
          participantId={participantId}
          leaseSecondsLeft={leaseSecondsLeft}
          micVolume={micVolume}
          speakerMuted={speakerMuted}
          onToggleSpeakerMute={toggleSpeakerMute}
          soundEffects={soundEffects}
          onToggleSoundEffects={setSoundEffects}
          rogerBeepEnabled={rogerBeepEnabled}
          onToggleRogerBeep={setRogerBeepEnabled}
          rogerBeepStyle={rogerBeepStyle}
          activeChannel={activeChannel}
          onChannelChange={setActiveChannel}
          transmissionHistory={transmissionHistory}
          onRequestFloor={requestFloor}
          onReleaseFloor={releaseFloor}
          onToggleFloor={toggleFloor}
          onLeaveSession={leaveSession}
          onEndSession={endSession}
          onRemoveParticipant={removeParticipant}
          errorMessage={errorMessage}
          onClearError={() => setErrorMessage(null)}
          micPermissionDenied={micPermissionDenied}
          onRequestMicPermission={requestMicrophonePermission}
          rssi={rssi}
          getAudioFrequencyData={getAudioFrequencyData}
          getAudioTimeDomainData={getAudioTimeDomainData}
        />
      ) : (
        <HomeScreen
          onOpenCreateOneToOne={() => setCreateModalType('one-to-one')}
          onOpenCreateGroup={() => setCreateModalType('group')}
          onOpenJoinPin={() => setIsJoinModalOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isOnline={isOnline}
          displayName={displayName}
          activeChannel={activeChannel}
          onChannelChange={setActiveChannel}
          rssi={rssi}
          rogerBeepEnabled={rogerBeepEnabled}
          rogerBeepStyle={rogerBeepStyle}
          errorMessage={errorMessage}
          onClearError={() => setErrorMessage(null)}
          micPermissionDenied={micPermissionDenied}
          onRequestMicPermission={requestMicrophonePermission}
          getAudioFrequencyData={getAudioFrequencyData}
          getAudioTimeDomainData={getAudioTimeDomainData}
        />
      )}

      {/* Modals */}
      {createModalType && (
        <CreateSessionModal
          isOpen={!!createModalType}
          onClose={() => setCreateModalType(null)}
          type={createModalType}
          displayName={displayName}
          onSaveDisplayName={setDisplayName}
          onSessionCreated={handleSessionCreated}
        />
      )}

      {isJoinModalOpen && (
        <JoinModal
          isOpen={isJoinModalOpen}
          onClose={() => setIsJoinModalOpen(false)}
          displayName={displayName}
          onSaveDisplayName={setDisplayName}
          onJoin={handleJoinFromPin}
          initialPin={initialJoinPin}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          displayName={displayName}
          onSaveDisplayName={setDisplayName}
          soundEffects={soundEffects}
          onToggleSoundEffects={setSoundEffects}
          rogerBeepEnabled={rogerBeepEnabled}
          onToggleRogerBeep={setRogerBeepEnabled}
          rogerBeepStyle={rogerBeepStyle}
          onChangeRogerBeepStyle={setRogerBeepStyle}
          hapticsEnabled={hapticsEnabled}
          onToggleHaptics={setHapticsEnabled}
          rfFilterEnabled={rfFilterEnabled}
          onToggleRfFilter={setRfFilterEnabled}
          squelchTailEnabled={squelchTailEnabled}
          onToggleSquelchTail={setSquelchTailEnabled}
          speakerMuted={speakerMuted}
          onToggleSpeakerMute={toggleSpeakerMute}
          onStartMicCheck={startMicCheck}
          onStopMicCheckAndPlay={stopMicCheckAndPlay}
          onCancelMicCheck={cancelMicCheck}
          onGetMicVolumeLevel={getMicVolumeLevel}
          rttMs={rssi.latencyMs}
          packetLossPct={rssi.packetLossPct}
        />
      )}
    </div>
  );
}
