import { renderWidget, usePlugin } from '@remnote/plugin-sdk';
import { useState, useEffect, useCallback } from 'react';
import {
	ControllerMapping,
	DEFAULT_MAPPING,
	deleteOrSwapButtonMapping,
	getDeviceMapping,
	parseGamepadId,
	getDeviceMappingKey,
	QueueInteraction,
	QueueInteractionPrettyName,
} from './funcs/buttonMapping';
import { logMessage, LogType } from './funcs/logging';
import useGamepadInput from './funcs/gamePadInput';
import { SimpleGamepadOutline } from './components/GamepadVisual';
import './App.css';

// Map QueueInteraction to emoji
const QueueInteractionEmoji: Record<QueueInteraction, string> = {
	[QueueInteraction.hideAnswer]: '👁️',
	[QueueInteraction.goBackToPreviousCard]: '⬅️',
	[QueueInteraction.scrollUp]: '⬆️',
	[QueueInteraction.scrollDown]: '⬇️',
	[QueueInteraction.exitQueue]: '🚪',
	[QueueInteraction.answerCardAsAgain]: '🔴',
	[QueueInteraction.answerCardAsEasy]: '🟢',
	[QueueInteraction.answerCardAsGood]: '🟡',
	[QueueInteraction.answerCardAsHard]: '🟠',
	[QueueInteraction.answerCardAsTooEarly]: '⏭️',
	[QueueInteraction.answerCardAsViewedAsLeech]: '🩹',
	[QueueInteraction.resetCard]: '🔄',
};

// Interface for known device
interface KnownDevice {
	id: string;
	name: string;
	vendorId: string;
	productId: string;
}

// Platform detection types
type DetectedPlatform = 'iOS' | 'iPadOS' | 'macOS' | 'Windows' | 'Android' | 'Linux' | 'Unknown';

// Detect the current platform
function detectPlatform(): DetectedPlatform {
	const ua = navigator.userAgent;
	const platform = navigator.platform;

	// Check for iPad first (iPadOS 13+ reports as Mac)
	if (/iPad/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
		return 'iPadOS';
	}
	// Check for iPhone
	if (/iPhone/.test(ua)) {
		return 'iOS';
	}
	// Check for Mac (not iPad)
	if (/Mac/.test(platform)) {
		return 'macOS';
	}
	// Check for Windows
	if (/Win/.test(platform)) {
		return 'Windows';
	}
	// Check for Android
	if (/Android/.test(ua)) {
		return 'Android';
	}
	// Check for Linux
	if (/Linux/.test(platform)) {
		return 'Linux';
	}
	return 'Unknown';
}

// Get emoji for platform
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

// Check if platform is mobile (iOS/iPadOS)
function isMobilePlatform(platform: DetectedPlatform): boolean {
	return platform === 'iOS' || platform === 'iPadOS';
}

function GamePadSettingsUI() {
	const plugin = usePlugin();
	const [mappings, setMappings] = useState<ControllerMapping>([]);
	const [mappingButtonIndex, setMappingButtonIndex] = useState<number | null>(null);
	const [waitingForAction, setWaitingForAction] = useState(false);
	const [selectedAction, setSelectedAction] = useState<QueueInteraction | null>(null);
	const [gamepadName, setGamepadName] = useState<string>('');
	const [highlightedButton, setHighlightedButton] = useState<number | null>(null);
	const [connectedGamepadId, setConnectedGamepadId] = useState<string | null>(null);
	const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
	const [knownDevices, setKnownDevices] = useState<KnownDevice[]>([]);
	const [gamepadEnabled, setGamepadEnabled] = useState<boolean>(true);
	const [queueStatsEnabled, setQueueStatsEnabled] = useState<boolean>(true);
	const [detectedPlatform] = useState<DetectedPlatform>(() => detectPlatform());
	const isMobile = isMobilePlatform(detectedPlatform);

	const {
		buttonIndex,
		buttonPressed,
		setButtonPressed,
		currentGamepadId: hookGamepadId,
		deviceInfo,
	} = useGamepadInput();

	// Load known devices from storage
	useEffect(() => {
		async function loadKnownDevices() {
			const stored = await plugin.storage.getSynced('knownGamepadDevices');
			if (Array.isArray(stored)) {
				setKnownDevices(stored);
			}
		}
		loadKnownDevices();
	}, [plugin]);

	// Load toggle preferences from storage (auto-enable on iOS/iPadOS)
	useEffect(() => {
		async function loadToggles() {
			if (isMobile) {
				// On iOS/iPadOS, always enable both features
				setGamepadEnabled(true);
				setQueueStatsEnabled(true);
			} else {
				// On desktop, use user's saved preferences
				const gamepadEn = await plugin.storage.getSynced('gamepadEnabled');
				const statsEn = await plugin.storage.getSynced('queueStatsEnabled');
				// Default to true if not set
				setGamepadEnabled(gamepadEn !== false);
				setQueueStatsEnabled(statsEn !== false);
			}
		}
		loadToggles();
	}, [plugin, isMobile]);

	// Save known devices to storage
	const saveKnownDevices = useCallback(async (devices: KnownDevice[]) => {
		await plugin.storage.setSynced('knownGamepadDevices', devices);
	}, [plugin]);

	// Toggle handlers
	const handleGamepadToggle = async (enabled: boolean) => {
		setGamepadEnabled(enabled);
		await plugin.storage.setSynced('gamepadEnabled', enabled);
		plugin.app.toast(enabled ? '🎮 Gamepad controls enabled' : '🎮 Gamepad controls disabled');
	};

	const handleQueueStatsToggle = async (enabled: boolean) => {
		setQueueStatsEnabled(enabled);
		await plugin.storage.setSynced('queueStatsEnabled', enabled);
		plugin.app.toast(enabled ? '📊 Queue stats enabled' : '📊 Queue stats disabled');
	};

	// Add a new device to known devices list
	const addKnownDevice = useCallback((gamepadId: string) => {
		const parsed = parseGamepadId(gamepadId);
		if (!parsed) return;

		const deviceKey = getDeviceMappingKey(parsed.vendorId, parsed.productId);

		setKnownDevices(prev => {
			// Check if already exists
			if (prev.some(d => getDeviceMappingKey(d.vendorId, d.productId) === deviceKey)) {
				return prev;
			}

			// Extract friendly name (remove vendor/product info)
			let friendlyName = gamepadId
				.replace(/\s*\(.*?\)\s*/g, '') // Remove parenthetical content
				.replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, '') // Remove leading hex IDs
				.trim() || `Device ${parsed.vendorId}:${parsed.productId}`;

			const newDevice: KnownDevice = {
				id: gamepadId,
				name: friendlyName,
				vendorId: parsed.vendorId,
				productId: parsed.productId,
			};

			const updated = [...prev, newDevice];
			saveKnownDevices(updated);
			return updated;
		});
	}, [saveKnownDevices]);

	// Sync gamepad ID from hook
	useEffect(() => {
		if (hookGamepadId) {
			setConnectedGamepadId(hookGamepadId);
			setGamepadName(hookGamepadId);
			// Auto-select connected device if no device is selected
			if (!selectedDeviceId) {
				setSelectedDeviceId(hookGamepadId);
			}
			// Add to known devices
			addKnownDevice(hookGamepadId);
		}
	}, [hookGamepadId, deviceInfo, selectedDeviceId, addKnownDevice]);

	// Track button press for highlight effect
	useEffect(() => {
		if (buttonPressed && buttonIndex !== -1) {
			setHighlightedButton(buttonIndex);
			// Clear highlight after 300ms
			const timer = setTimeout(() => setHighlightedButton(null), 300);
			return () => clearTimeout(timer);
		}
	}, [buttonPressed, buttonIndex]);

	// Track connected gamepads (fallback in case hook doesn't have it yet)
	useEffect(() => {
		const updateGamepadName = () => {
			const gamepads = navigator.getGamepads?.() || [];
			for (const gp of gamepads) {
				if (gp && gp.connected) {
					setGamepadName(gp.id);
					setConnectedGamepadId(gp.id);
					if (!selectedDeviceId) {
						setSelectedDeviceId(gp.id);
					}
					addKnownDevice(gp.id);
					return;
				}
			}
			setGamepadName('');
			setConnectedGamepadId(null);
		};

		updateGamepadName();
		const interval = setInterval(updateGamepadName, 1000);

		window.addEventListener('gamepadconnected', updateGamepadName);
		window.addEventListener('gamepaddisconnected', updateGamepadName);

		return () => {
			clearInterval(interval);
			window.removeEventListener('gamepadconnected', updateGamepadName);
			window.removeEventListener('gamepaddisconnected', updateGamepadName);
		};
	}, [selectedDeviceId, addKnownDevice]);

	// Emit status of UI being shown
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
	}, [plugin, selectedAction, selectedDeviceId]); // Reload when action is set (after mapping) or selected device changes

	// Get button label from index
	const getButtonLabel = useCallback((index: number) => {
		const mapping = DEFAULT_MAPPING.find(m => m.buttonIndex === index);
		return mapping?.buttonLabel || `Button ${index}`;
	}, []);

	// Get current action for a button
	const getButtonAction = useCallback((btnIndex: number) => {
		const mapping = mappings.find(m => m.buttonIndex === btnIndex);
		if (mapping) {
			return QueueInteractionPrettyName[mapping.queueInteraction] || 'Unknown';
		}
		return 'Not mapped';
	}, [mappings]);

	// Start mapping for a button - shows action selection modal
	const startMapping = (btnIndex: number) => {
		setMappingButtonIndex(btnIndex);
		setSelectedAction(null);
	};

	// Select an action to map (saves to selected device's storage)
	const selectAction = async (action: QueueInteraction) => {
		if (mappingButtonIndex === null) return;

		logMessage(plugin, LogType.Info, false, `Mapping button ${mappingButtonIndex} to ${QueueInteractionPrettyName[action]} for device ${selectedDeviceId}`);

		await deleteOrSwapButtonMapping(plugin, mappingButtonIndex, action, false, selectedDeviceId);

		setSelectedAction(action);
		setMappingButtonIndex(null);

		plugin.app.toast(`✅ Button mapped to ${QueueInteractionPrettyName[action]}`);
	};

	// Cancel mapping
	const cancelMapping = () => {
		setMappingButtonIndex(null);
		setWaitingForAction(false);
		setSelectedAction(null);
	};

	// Handle gamepad button press during "waiting for gamepad" mode
	useEffect(() => {
		if (waitingForAction && buttonPressed && buttonIndex !== -1 && selectedAction !== null) {
			logMessage(plugin, LogType.Info, false, `Gamepad button ${buttonIndex} pressed, mapping to ${selectedAction}`);

			deleteOrSwapButtonMapping(plugin, buttonIndex, selectedAction, false, selectedDeviceId).then(() => {
				plugin.app.toast(`✅ ${getButtonLabel(buttonIndex)} mapped to ${QueueInteractionPrettyName[selectedAction]}`);
				setWaitingForAction(false);
				setSelectedAction(null);
			});

			setButtonPressed(false);
		} else if (buttonPressed) {
			setButtonPressed(false);
		}
	}, [buttonPressed, buttonIndex, waitingForAction, selectedAction, plugin, setButtonPressed, selectedDeviceId]);

	// Get list of all button indices we care about
	const allButtonIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15].sort((a, b) => a - b);

	// Actions to show in the modal
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

	// Get display name for selected device
	const getSelectedDeviceDisplay = () => {
		if (!selectedDeviceId) return 'No device selected';
		const parsed = parseGamepadId(selectedDeviceId);
		if (parsed) {
			const device = knownDevices.find(d => d.vendorId === parsed.vendorId && d.productId === parsed.productId);
			return device?.name || `${parsed.vendorId}:${parsed.productId}`;
		}
		return selectedDeviceId;
	};

	// Check if selected device is connected
	const isSelectedDeviceConnected = () => {
		if (!selectedDeviceId || !connectedGamepadId) return false;
		const selectedParsed = parseGamepadId(selectedDeviceId);
		const connectedParsed = parseGamepadId(connectedGamepadId);
		if (selectedParsed && connectedParsed) {
			return selectedParsed.vendorId === connectedParsed.vendorId &&
				selectedParsed.productId === connectedParsed.productId;
		}
		return selectedDeviceId === connectedGamepadId;
	};

	// Handle device selection from dropdown
	const handleDeviceSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const value = e.target.value;
		if (value === '__connected__' && connectedGamepadId) {
			setSelectedDeviceId(connectedGamepadId);
		} else if (value) {
			// Find device by key
			const device = knownDevices.find(d => getDeviceMappingKey(d.vendorId, d.productId) === value);
			if (device) {
				setSelectedDeviceId(device.id);
			}
		}
	};

	// Get current dropdown value
	const getDropdownValue = () => {
		if (!selectedDeviceId) return '';
		const parsed = parseGamepadId(selectedDeviceId);
		if (parsed) {
			return getDeviceMappingKey(parsed.vendorId, parsed.productId);
		}
		return '';
	};

	return (
		<div className="settings-container-v2">
			{/* Left Panel - Controller Display */}
			<SimpleGamepadOutline
				highlightedButton={highlightedButton}
				gamepadName={gamepadName}
			/>

			{/* Right Panel - Mappings List */}
			<div className="mappings-panel">
				<div className="panel-header">
					BUTTON MAPPINGS
				</div>

				{/* Device Selection Dropdown */}
				<div style={{
					padding: '8px 12px',
					borderBottom: '1px solid rgba(255,255,255,0.1)',
					display: 'flex',
					alignItems: 'center',
					gap: '8px'
				}}>
					<span style={{ fontSize: '11px', opacity: 0.7 }}>Device:</span>
					<select
						value={getDropdownValue()}
						onChange={handleDeviceSelect}
						style={{
							flex: 1,
							padding: '6px 8px',
							borderRadius: '4px',
							border: '1px solid rgba(255,255,255,0.2)',
							background: 'rgba(255,255,255,0.1)',
							color: 'inherit',
							fontSize: '12px',
							cursor: 'pointer',
						}}
					>
						{knownDevices.length === 0 && !connectedGamepadId && (
							<option value="">No devices found</option>
						)}
						{connectedGamepadId && (
							<option value={(() => {
								const p = parseGamepadId(connectedGamepadId);
								return p ? getDeviceMappingKey(p.vendorId, p.productId) : '';
							})()}>
								🟢 {(() => {
									const p = parseGamepadId(connectedGamepadId);
									if (p) {
										const device = knownDevices.find(d => d.vendorId === p.vendorId && d.productId === p.productId);
										return device?.name || `${p.vendorId}:${p.productId}`;
									}
									return 'Connected Device';
								})()} (Connected)
							</option>
						)}
						{knownDevices
							.filter(d => {
								// Don't show connected device again
								if (!connectedGamepadId) return true;
								const connectedParsed = parseGamepadId(connectedGamepadId);
								return !(connectedParsed &&
									d.vendorId === connectedParsed.vendorId &&
									d.productId === connectedParsed.productId);
							})
							.map(device => (
								<option
									key={getDeviceMappingKey(device.vendorId, device.productId)}
									value={getDeviceMappingKey(device.vendorId, device.productId)}
								>
									⚪ {device.name} ({device.vendorId}:{device.productId})
								</option>
							))
						}
					</select>
				</div>

				{/* Feature Toggles */}
				<div style={{
					padding: '12px',
					borderBottom: '1px solid rgba(255,255,255,0.1)',
					display: 'flex',
					flexDirection: 'column',
					gap: '10px'
				}}>
					{/* Platform Detection Display */}
					<div style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						marginBottom: '8px'
					}}>
						<span style={{ fontSize: '11px', opacity: 0.7 }}>Features</span>
						<span style={{
							fontSize: '11px',
							padding: '3px 8px',
							background: isMobile ? 'rgba(34, 197, 94, 0.2)' : 'rgba(100, 100, 100, 0.2)',
							borderRadius: '4px',
							color: isMobile ? '#22c55e' : '#8b949e'
						}}>
							{getPlatformEmoji(detectedPlatform)} {detectedPlatform}
						</span>
					</div>

					{/* Mobile auto-enable notice */}
					{isMobile && (
						<div style={{
							fontSize: '11px',
							color: '#22c55e',
							background: 'rgba(34, 197, 94, 0.1)',
							padding: '8px',
							borderRadius: '6px',
							marginBottom: '4px'
						}}>
							✨ Auto-enabled on {detectedPlatform}
						</div>
					)}

					{/* Gamepad Toggle */}
					<div style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						gap: '8px'
					}}>
						<span style={{ fontSize: '12px' }}>🎮 Gamepad Controls</span>
						<label className="toggle-switch">
							<input
								type="checkbox"
								checked={gamepadEnabled}
								onChange={(e) => handleGamepadToggle(e.target.checked)}
							/>
							<span className="toggle-slider"></span>
						</label>
					</div>

					{/* Queue Stats Toggle */}
					<div style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						gap: '8px'
					}}>
						<span style={{ fontSize: '12px' }}>📊 Queue Stats</span>
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

				{/* Status indicator */}
				{selectedDeviceId && !isSelectedDeviceConnected() && (
					<div style={{
						padding: '8px 12px',
						color: '#ff9800',
						fontSize: '11px',
						textAlign: 'center',
						background: 'rgba(255,152,0,0.1)'
					}}>
						⚠️ Editing offline device. Changes will apply when connected.
					</div>
				)}

				{!selectedDeviceId && !connectedGamepadId && (
					<div style={{ padding: '12px', color: '#ff9800', fontSize: '12px', textAlign: 'center' }}>
						⚠️ No gamepad connected. Connect a gamepad to configure mappings.
					</div>
				)}

				<div className="mappings-list">
					{allButtonIndices.map((btnIndex) => (
						<div
							key={btnIndex}
							className={`mapping-row ${highlightedButton === btnIndex ? 'highlighted' : ''}`}
						>
							<span className="button-name">{getButtonLabel(btnIndex)}</span>
							<span className="mapping-value">{getButtonAction(btnIndex)}</span>
							<button
								className="map-btn"
								onClick={() => startMapping(btnIndex)}
								disabled={!selectedDeviceId}
							>
								Map
							</button>
						</div>
					))}
				</div>
			</div>

			{/* Action Selection Modal */}
			{mappingButtonIndex !== null && (
				<div className="mapping-modal-overlay" onClick={cancelMapping}>
					<div className="mapping-modal" onClick={e => e.stopPropagation()}>
						<h3>Map {getButtonLabel(mappingButtonIndex)}</h3>
						<p>Select an action for this button:</p>

						<div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
							{actionsToShow.map((action) => (
								<button
									key={action}
									className="quick-action-btn"
									onClick={() => selectAction(action)}
									style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'flex-start', padding: '12px 16px' }}
								>
									<span style={{ fontSize: '20px' }}>{QueueInteractionEmoji[action]}</span>
									<span>{QueueInteractionPrettyName[action]}</span>
								</button>
							))}
						</div>

						<div className="modal-buttons">
							<button className="cancel-btn" onClick={cancelMapping}>Cancel</button>
						</div>
					</div>
				</div>
			)}

			{/* Waiting for Gamepad Button Modal */}
			{waitingForAction && selectedAction !== null && (
				<div className="mapping-modal-overlay" onClick={cancelMapping}>
					<div className="mapping-modal" onClick={e => e.stopPropagation()}>
						<h3>Press a Gamepad Button</h3>
						<p>Press the button you want to map to:</p>
						<div style={{ fontSize: '24px', margin: '20px 0' }}>
							{QueueInteractionEmoji[selectedAction]} {QueueInteractionPrettyName[selectedAction]}
						</div>
						<div className="modal-buttons">
							<button className="cancel-btn" onClick={cancelMapping}>Cancel</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

renderWidget(GamePadSettingsUI);
