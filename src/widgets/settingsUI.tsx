import { AppEvents, renderWidget, useAPIEventListener, usePlugin } from '@remnote/plugin-sdk';
import { useState, useEffect, useCallback } from 'react';
import {
	ControllerMapping,
	DEFAULT_MAPPING,
	deleteOrSwapButtonMapping,
	getDeviceMapping,
	getDeviceSettings,
	getDeviceMappingKey,
	getFriendlyDeviceName,
	KnownDevice,
	parseGamepadId,
	QueueInteraction,
	QueueInteractionPrettyName,
	registerKnownDevice,
	saveDeviceSettings,
} from './funcs/buttonMapping';
import { logMessage, LogType } from './funcs/logging';
import useGamepadInput from './funcs/gamePadInput';
import { SimpleGamepadOutline } from './components/GamepadVisual';
import './App.css';

// Visual metadata for each queue action: emoji, short label, accent color
const ACTION_META: Record<QueueInteraction, { emoji: string; label: string; color: string }> = {
	[QueueInteraction.answerCardAsAgain]: { emoji: '🔴', label: 'Forgot (Again)', color: '#f87171' },
	[QueueInteraction.answerCardAsHard]: { emoji: '🟠', label: 'Hard', color: '#fbbf24' },
	[QueueInteraction.answerCardAsGood]: { emoji: '🟡', label: 'Good', color: '#a3e635' },
	[QueueInteraction.answerCardAsEasy]: { emoji: '🟢', label: 'Easy', color: '#34d399' },
	[QueueInteraction.answerCardAsTooEarly]: { emoji: '⏭️', label: 'Skip', color: '#94a3b8' },
	[QueueInteraction.goBackToPreviousCard]: { emoji: '⬅️', label: 'Previous Card', color: '#60a5fa' },
	[QueueInteraction.scrollUp]: { emoji: '⬆️', label: 'Scroll Up', color: '#a78bfa' },
	[QueueInteraction.scrollDown]: { emoji: '⬇️', label: 'Scroll Down', color: '#a78bfa' },
	[QueueInteraction.hideAnswer]: { emoji: '👁️', label: 'Hide Answer', color: '#8b949e' },
	[QueueInteraction.exitQueue]: { emoji: '🚪', label: 'Exit Queue', color: '#8b949e' },
	[QueueInteraction.answerCardAsViewedAsLeech]: { emoji: '🩹', label: 'Leech', color: '#8b949e' },
	[QueueInteraction.resetCard]: { emoji: '🔄', label: 'Reset Card', color: '#8b949e' },
};

// Buttons grouped for the mapping list
const BUTTON_SECTIONS: { title: string; indices: number[] }[] = [
	{ title: 'Face Buttons', indices: [0, 1, 2, 3] },
	{ title: 'D-Pad', indices: [12, 13, 14, 15] },
	{ title: 'Bumpers & Triggers', indices: [4, 5, 6, 7] },
	{ title: 'Start / Select', indices: [8, 9] },
];

// Platform detection types
type DetectedPlatform = 'iOS' | 'iPadOS' | 'macOS' | 'Windows' | 'Android' | 'Linux' | 'Unknown';

function detectPlatform(): DetectedPlatform {
	const ua = navigator.userAgent;
	const platform = navigator.platform;

	if (/iPad/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
		return 'iPadOS';
	}
	if (/iPhone/.test(ua)) {
		return 'iOS';
	}
	if (/Mac/.test(platform)) {
		return 'macOS';
	}
	if (/Win/.test(platform)) {
		return 'Windows';
	}
	if (/Android/.test(ua)) {
		return 'Android';
	}
	if (/Linux/.test(platform)) {
		return 'Linux';
	}
	return 'Unknown';
}

function getPlatformEmoji(platform: DetectedPlatform): string {
	switch (platform) {
		case 'iOS': return '📱';
		case 'iPadOS': return '📱';
		case 'macOS': return '💻';
		case 'Windows': return '🖥️';
		case 'Android': return '🤖';
		case 'Linux': return '🐧';
		default: return '❓';
	}
}

function isMobilePlatform(platform: DetectedPlatform): boolean {
	return platform === 'iOS' || platform === 'iPadOS';
}

function GamePadSettingsUI() {
	const plugin = usePlugin();
	const [mappings, setMappings] = useState<ControllerMapping>([]);
	const [mappingButtonIndex, setMappingButtonIndex] = useState<number | null>(null);
	const [mappingVersion, setMappingVersion] = useState(0);
	const [highlightedButton, setHighlightedButton] = useState<number | null>(null);
	const [connectedGamepadId, setConnectedGamepadId] = useState<string | null>(null);
	const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
	const [knownDevices, setKnownDevices] = useState<KnownDevice[]>([]);
	const [gamepadEnabled, setGamepadEnabled] = useState<boolean>(true);
	const [deviceEnabled, setDeviceEnabled] = useState<boolean>(true);
	const [queueStatsEnabled, setQueueStatsEnabled] = useState<boolean>(true);
	const [detectedPlatform] = useState<DetectedPlatform>(() => detectPlatform());
	const isMobile = isMobilePlatform(detectedPlatform);

	const { buttonIndex, buttonPressed, setButtonPressed, currentGamepadId: hookGamepadId } =
		useGamepadInput();

	// Load known devices from storage
	const loadKnownDevices = useCallback(async () => {
		const stored = await plugin.storage.getSynced('knownGamepadDevices');
		if (Array.isArray(stored)) {
			setKnownDevices(stored as KnownDevice[]);
		}
	}, [plugin]);

	useEffect(() => {
		loadKnownDevices();
	}, [loadKnownDevices]);

	useAPIEventListener(AppEvents.MessageBroadcast, undefined, async (message: any) => {
		if (message?.message?.type === 'knownDevicesUpdated') {
			loadKnownDevices();
		}
	});

	// Load toggle preferences from storage (auto-enable on iOS/iPadOS)
	useEffect(() => {
		async function loadToggles() {
			if (isMobile) {
				setGamepadEnabled(true);
				setQueueStatsEnabled(true);
			} else {
				const gamepadEn = await plugin.storage.getSynced('gamepadEnabled');
				const statsEn = await plugin.storage.getSynced('queueStatsEnabled');
				setGamepadEnabled(gamepadEn !== false);
				setQueueStatsEnabled(statsEn !== false);
			}
		}
		loadToggles();
	}, [plugin, isMobile]);

	// Load per-device enabled state whenever the selected device changes
	useEffect(() => {
		async function loadDeviceEnabled() {
			if (!selectedDeviceId) {
				setDeviceEnabled(true);
				return;
			}
			const settings = await getDeviceSettings(plugin, selectedDeviceId);
			if (settings) {
				setDeviceEnabled(settings.enabled !== false);
			} else {
				// No per-device state yet: reflect the global toggle
				const globalEnabled = await plugin.storage.getSynced('gamepadEnabled');
				setDeviceEnabled(globalEnabled !== false);
			}
		}
		loadDeviceEnabled();
	}, [plugin, selectedDeviceId]);

	// Toggle handlers (broadcast so live widgets react instantly)
	const handleGamepadToggle = async (enabled: boolean) => {
		setGamepadEnabled(enabled);
		await plugin.storage.setSynced('gamepadEnabled', enabled);
		plugin.messaging.broadcast({ type: 'featureTogglesUpdated' });
		plugin.app.toast(enabled ? '🎮 Gamepad controls enabled' : '🎮 Gamepad controls disabled');
	};

	const handleDeviceEnabledToggle = async (enabled: boolean) => {
		if (!selectedDeviceId) return;
		setDeviceEnabled(enabled);
		await saveDeviceSettings(plugin, selectedDeviceId, { enabled });
		plugin.app.toast(
			enabled
				? `✅ ${getSelectedDeviceDisplay()} enabled — auto-applies when it connects`
				: `🚫 ${getSelectedDeviceDisplay()} disabled`
		);
	};

	const handleQueueStatsToggle = async (enabled: boolean) => {
		setQueueStatsEnabled(enabled);
		await plugin.storage.setSynced('queueStatsEnabled', enabled);
		plugin.messaging.broadcast({ type: 'featureTogglesUpdated' });
		plugin.app.toast(enabled ? '📊 Queue stats enabled' : '📊 Queue stats disabled');
	};

	// Sync gamepad ID from hook; auto-select the connected device
	useEffect(() => {
		if (hookGamepadId) {
			setConnectedGamepadId(hookGamepadId);
			setSelectedDeviceId((prev) => prev ?? hookGamepadId);
		}
	}, [hookGamepadId]);

	// Track button press for highlight effect
	useEffect(() => {
		if (buttonPressed && buttonIndex !== -1) {
			setHighlightedButton(buttonIndex);
			setButtonPressed(false);
			const timer = setTimeout(() => setHighlightedButton(null), 300);
			return () => clearTimeout(timer);
		}
	}, [buttonPressed, buttonIndex, setButtonPressed]);

	// Poll for connected gamepads (fallback: the connect event only fires once
	// per page, so a controller plugged in before the popup opened needs this)
	useEffect(() => {
		let lastRegisteredId: string | null = null;

		const updateConnected = () => {
			const gamepads = navigator.getGamepads?.() || [];
			for (const gp of gamepads) {
				if (gp && gp.connected) {
					setConnectedGamepadId(gp.id);
					setSelectedDeviceId((prev) => prev ?? gp.id);
					if (lastRegisteredId !== gp.id) {
						lastRegisteredId = gp.id;
						registerKnownDevice(plugin, gp.id);
					}
					return;
				}
			}
			lastRegisteredId = null;
			setConnectedGamepadId(null);
		};

		updateConnected();
		const interval = setInterval(updateConnected, 2000);
		return () => clearInterval(interval);
	}, [plugin]);

	// Tell the queue handler the settings UI is open (pauses queue actions)
	useEffect(() => {
		const setSessionStatus = async (status: boolean) => {
			await plugin.storage.setSession('settingsUiShown', status);
		};
		setSessionStatus(true);
		return () => { setSessionStatus(false); };
	}, []);

	// Load mappings from storage (for selected device)
	useEffect(() => {
		async function loadMappings() {
			const result = await getDeviceMapping(plugin, selectedDeviceId);
			setMappings(result.mapping);
			logMessage(plugin, LogType.Info, false, `Loaded mappings for device: ${selectedDeviceId}`, result.deviceKey ? `(key: ${result.deviceKey})` : '(using legacy/default)');
		}
		loadMappings();
	}, [plugin, selectedDeviceId, mappingVersion]);

	const getButtonLabel = useCallback((index: number) => {
		const mapping = DEFAULT_MAPPING.find(m => m.buttonIndex === index);
		return mapping?.buttonLabel || `Button ${index}`;
	}, []);

	const getButtonMapping = useCallback((btnIndex: number) => {
		return mappings.find(m => m.buttonIndex === btnIndex);
	}, [mappings]);

	// Select an action to map (saves to selected device's storage)
	const selectAction = async (action: QueueInteraction) => {
		if (mappingButtonIndex === null) return;

		logMessage(plugin, LogType.Info, false, `Mapping button ${mappingButtonIndex} to ${QueueInteractionPrettyName[action]} for device ${selectedDeviceId}`);

		await deleteOrSwapButtonMapping(plugin, mappingButtonIndex, action, false, selectedDeviceId);

		setMappingButtonIndex(null);
		setMappingVersion((v) => v + 1);

		plugin.app.toast(`✅ Button mapped to ${ACTION_META[action]?.label ?? QueueInteractionPrettyName[action]}`);
	};

	// Reset the selected device's mappings back to defaults
	const resetMappings = async () => {
		let storageKey = 'controllerMapping';
		if (selectedDeviceId) {
			const parsed = parseGamepadId(selectedDeviceId);
			if (parsed) {
				storageKey = getDeviceMappingKey(parsed.vendorId, parsed.productId);
			}
		}
		await plugin.storage.setSynced(storageKey, DEFAULT_MAPPING);
		plugin.messaging.broadcast({ type: 'controllerMappingUpdated', storageKey });
		setMappingVersion((v) => v + 1);
		plugin.app.toast('🔄 Mappings reset to defaults');
	};

	// Actions offered in the mapping modal
	const actionsToShow: QueueInteraction[] = [
		QueueInteraction.answerCardAsAgain,
		QueueInteraction.answerCardAsHard,
		QueueInteraction.answerCardAsGood,
		QueueInteraction.answerCardAsEasy,
		QueueInteraction.answerCardAsTooEarly,
		QueueInteraction.goBackToPreviousCard,
		QueueInteraction.scrollUp,
		QueueInteraction.scrollDown,
		// exitQueue removed - not supported by RemNote SDK
	];

	const getSelectedDeviceDisplay = () => {
		if (!selectedDeviceId) return 'No device selected';
		const parsed = parseGamepadId(selectedDeviceId);
		if (parsed) {
			const device = knownDevices.find(d => d.vendorId === parsed.vendorId && d.productId === parsed.productId);
			return device?.name || getFriendlyDeviceName(selectedDeviceId);
		}
		return getFriendlyDeviceName(selectedDeviceId);
	};

	const sameDevice = (idA: string | null, idB: string | null) => {
		if (!idA || !idB) return false;
		const a = parseGamepadId(idA);
		const b = parseGamepadId(idB);
		if (a && b) {
			return a.vendorId === b.vendorId && a.productId === b.productId;
		}
		return idA === idB;
	};

	const isSelectedDeviceConnected = () => sameDevice(selectedDeviceId, connectedGamepadId);

	// Device list for the chips: connected device first, then known devices
	const deviceChips: { key: string; id: string; name: string; sub: string; connected: boolean }[] = [];
	if (connectedGamepadId) {
		const parsed = parseGamepadId(connectedGamepadId);
		const known = parsed
			? knownDevices.find(d => d.vendorId === parsed.vendorId && d.productId === parsed.productId)
			: undefined;
		deviceChips.push({
			key: parsed ? getDeviceMappingKey(parsed.vendorId, parsed.productId) : connectedGamepadId,
			id: connectedGamepadId,
			name: known?.name || getFriendlyDeviceName(connectedGamepadId),
			sub: parsed ? `${parsed.vendorId}:${parsed.productId}` : '',
			connected: true,
		});
	}
	for (const device of knownDevices) {
		if (sameDevice(device.id, connectedGamepadId)) continue;
		deviceChips.push({
			key: getDeviceMappingKey(device.vendorId, device.productId),
			id: device.id,
			name: device.name,
			sub: `${device.vendorId}:${device.productId}`,
			connected: false,
		});
	}

	return (
		<div className="gp-root">
			{/* Header */}
			<div className="gp-header">
				<div>
					<div className="gp-title">🎮 FlashPad</div>
					<div className="gp-subtitle">Gamepad controls &amp; queue tools</div>
				</div>
				<span className={`gp-badge ${isMobile ? 'gp-badge-green' : ''}`}>
					{getPlatformEmoji(detectedPlatform)} {detectedPlatform}
				</span>
			</div>

			{isMobile && (
				<div className="gp-notice gp-notice-green">
					✨ All features are auto-enabled on {detectedPlatform}
				</div>
			)}

			<div className="gp-columns">
				{/* Left column — device */}
				<div className="gp-col">
					<div className="gp-card">
						<div className="gp-card-title">
							<span>Controller</span>
							{connectedGamepadId
								? <span className="gp-status gp-status-on"><span className="gp-dot gp-dot-on" /> Connected</span>
								: <span className="gp-status"><span className="gp-dot" /> Not connected</span>}
						</div>

						<SimpleGamepadOutline highlightedButton={highlightedButton} />

						{connectedGamepadId && (
							<div className="gp-hint">Press any button on your controller to see it light up</div>
						)}

						{/* Device chips */}
						<div className="gp-device-list">
							{deviceChips.length === 0 && (
								<div className="gp-empty">
									No controllers yet. Connect one and press any button — it will be remembered here.
								</div>
							)}
							{deviceChips.map((chip) => (
								<button
									key={chip.key}
									className={`gp-device-chip ${sameDevice(selectedDeviceId, chip.id) ? 'selected' : ''}`}
									onClick={() => setSelectedDeviceId(chip.id)}
								>
									<span className={`gp-dot ${chip.connected ? 'gp-dot-on' : ''}`} />
									<span className="gp-device-info">
										<span className="gp-device-name">{chip.name}</span>
										{chip.sub && <span className="gp-device-sub">{chip.sub}</span>}
									</span>
									{chip.connected && <span className="gp-device-live">LIVE</span>}
								</button>
							))}
						</div>

						{/* Per-device enable toggle */}
						{selectedDeviceId && (
							<div className="gp-row gp-row-boxed">
								<div className="gp-row-text">
									<span className="gp-row-label">Enable this controller</span>
									<span className="gp-row-desc">
										Saved per device — auto-applies whenever it connects
									</span>
								</div>
								<label className="toggle-switch">
									<input
										type="checkbox"
										checked={deviceEnabled}
										onChange={(e) => handleDeviceEnabledToggle(e.target.checked)}
									/>
									<span className="toggle-slider"></span>
								</label>
							</div>
						)}

						{selectedDeviceId && !isSelectedDeviceConnected() && (
							<div className="gp-notice gp-notice-amber">
								⚠️ Editing an offline device — changes apply when it connects.
							</div>
						)}
					</div>

					{/* Features card */}
					<div className="gp-card">
						<div className="gp-card-title"><span>Features</span></div>

						<div className="gp-row">
							<div className="gp-row-text">
								<span className="gp-row-label">🎮 Gamepad Controls</span>
								<span className="gp-row-desc">Global default for new controllers</span>
							</div>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={gamepadEnabled}
									onChange={(e) => handleGamepadToggle(e.target.checked)}
								/>
								<span className="toggle-slider"></span>
							</label>
						</div>

						<div className="gp-row">
							<div className="gp-row-text">
								<span className="gp-row-label">📊 Queue Stats</span>
								<span className="gp-row-desc">Live session stats during review</span>
							</div>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={queueStatsEnabled}
									onChange={(e) => handleQueueStatsToggle(e.target.checked)}
								/>
								<span className="toggle-slider"></span>
							</label>
						</div>

					</div>
				</div>

				{/* Right column — mappings */}
				<div className="gp-col">
					<div className="gp-card">
						<div className="gp-card-title">
							<span>Button Mappings{selectedDeviceId ? ` — ${getSelectedDeviceDisplay()}` : ''}</span>
							<button className="gp-btn gp-btn-ghost" onClick={resetMappings} disabled={!selectedDeviceId}>
								Reset defaults
							</button>
						</div>

						{!selectedDeviceId && (
							<div className="gp-notice gp-notice-amber">
								⚠️ Connect a gamepad (or pick a known device) to configure its mappings.
							</div>
						)}

						<div className="gp-map-sections">
							{BUTTON_SECTIONS.map((section) => (
								<div key={section.title}>
									<div className="gp-map-section-title">{section.title}</div>
									{section.indices.map((btnIndex) => {
										const mapping = getButtonMapping(btnIndex);
										const meta = mapping ? ACTION_META[mapping.queueInteraction] : undefined;
										return (
											<div
												key={btnIndex}
												className={`gp-map-row ${highlightedButton === btnIndex ? 'highlighted' : ''}`}
											>
												<span className="gp-map-btn-name">{getButtonLabel(btnIndex)}</span>
												{meta ? (
													<span
														className="gp-pill"
														style={{ background: `${meta.color}1f`, color: meta.color }}
													>
														{meta.emoji} {meta.label}
													</span>
												) : (
													<span className="gp-pill gp-pill-empty">Not mapped</span>
												)}
												<button
													className="gp-btn"
													onClick={() => setMappingButtonIndex(btnIndex)}
													disabled={!selectedDeviceId}
												>
													Change
												</button>
											</div>
										);
									})}
								</div>
							))}
						</div>
					</div>
				</div>
			</div>

			{/* Action Selection Modal */}
			{mappingButtonIndex !== null && (
				<div className="gp-modal-overlay" onClick={() => setMappingButtonIndex(null)}>
					<div className="gp-modal" onClick={e => e.stopPropagation()}>
						<h3>Map {getButtonLabel(mappingButtonIndex)}</h3>
						<p>Choose what this button does in the queue:</p>

						<div className="gp-action-grid">
							{actionsToShow.map((action) => {
								const meta = ACTION_META[action];
								return (
									<button
										key={action}
										className="gp-action-btn"
										style={{ borderColor: `${meta.color}55` }}
										onClick={() => selectAction(action)}
									>
										<span className="gp-action-emoji">{meta.emoji}</span>
										<span style={{ color: meta.color }}>{meta.label}</span>
									</button>
								);
							})}
						</div>

						<div className="gp-modal-buttons">
							<button className="gp-btn gp-btn-ghost" onClick={() => setMappingButtonIndex(null)}>Cancel</button>
						</div>
					</div>
				</div>
			)}

		</div>
	);
}

renderWidget(GamePadSettingsUI);
