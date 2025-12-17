import { renderWidget, usePlugin } from '@remnote/plugin-sdk';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
	ControllerMapping,
	DEFAULT_MAPPING,
	deleteOrSwapButtonMapping,
	QueueInteraction,
	QueueInteractionPrettyName,
} from './funcs/buttonMapping';
import { logMessage, LogType } from './funcs/logging';
import useGamepadInput from './funcs/gamePadInput';
import { SimpleGamepadOutline } from './components/GamepadVisual';
import './App.css';

// Type for keyboard mapping
interface KeyboardMapping {
	buttonIndex: number;
	keys: string[];  // e.g., ['Ctrl', 'I'] for Ctrl+I
}

function GamePadSettingsUI() {
	const plugin = usePlugin();
	const [mappings, setMappings] = useState<ControllerMapping>([]);
	const [keyboardMappings, setKeyboardMappings] = useState<KeyboardMapping[]>([]);
	const [mappingButtonIndex, setMappingButtonIndex] = useState<number | null>(null);
	const [isCapturingKeys, setIsCapturingKeys] = useState(false);
	const [capturedKeys, setCapturedKeys] = useState<string[]>([]);
	const [gamepadName, setGamepadName] = useState<string>('');
	const keyInputRef = useRef<HTMLInputElement>(null);

	const {
		buttonIndex,
		buttonPressed,
		setButtonPressed,
	} = useGamepadInput();

	// Track connected gamepads
	useEffect(() => {
		const updateGamepadName = () => {
			const gamepads = navigator.getGamepads?.() || [];
			for (const gp of gamepads) {
				if (gp && gp.connected) {
					setGamepadName(gp.id);
					return;
				}
			}
			setGamepadName('');
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
	}, []);

	// Emit status of UI being shown
	useEffect(() => {
		const setSessionStatus = async (status: boolean) => {
			await plugin.storage.setSession('settingsUiShown', status);
		};
		setSessionStatus(true);
		return () => { setSessionStatus(false); };
	}, []);

	// Load mappings from storage
	useEffect(() => {
		async function loadMappings() {
			const storedMappings = await plugin.storage.getSynced('controllerMapping');
			setMappings(Array.isArray(storedMappings) ? storedMappings : DEFAULT_MAPPING);

			const storedKeyMappings = await plugin.storage.getSynced('keyboardMappings');
			setKeyboardMappings(Array.isArray(storedKeyMappings) ? storedKeyMappings : []);
		}
		loadMappings();
	}, [plugin]);

	// Get button label from index
	const getButtonLabel = useCallback((index: number) => {
		const mapping = DEFAULT_MAPPING.find(m => m.buttonIndex === index);
		return mapping?.buttonLabel || `Button ${index}`;
	}, []);

	// Get keyboard mapping display for a button
	const getKeyboardDisplay = useCallback((btnIndex: number) => {
		const keyMap = keyboardMappings.find(k => k.buttonIndex === btnIndex);
		if (keyMap && keyMap.keys.length > 0) {
			return keyMap.keys.join(' + ');
		}
		const mapping = mappings.find(m => m.buttonIndex === btnIndex);
		if (mapping) {
			return QueueInteractionPrettyName[mapping.queueInteraction] || '';
		}
		return 'Not mapped';
	}, [keyboardMappings, mappings]);

	// Start mapping for a button
	const startMapping = (btnIndex: number) => {
		setMappingButtonIndex(btnIndex);
		setIsCapturingKeys(true);
		setCapturedKeys([]);
		setTimeout(() => keyInputRef.current?.focus(), 50);
	};

	// Handle keyboard input for capturing shortcuts
	const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (!isCapturingKeys || mappingButtonIndex === null) return;

		e.preventDefault();
		e.stopPropagation();

		const keys: string[] = [];
		if (e.ctrlKey || e.metaKey) keys.push('Ctrl');
		if (e.altKey) keys.push('Alt');
		if (e.shiftKey) keys.push('Shift');

		// Add the main key
		const key = e.key;
		if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
			keys.push(key.length === 1 ? key.toUpperCase() : key);
		}

		if (keys.length > 0) {
			setCapturedKeys(keys);
		}
	}, [isCapturingKeys, mappingButtonIndex]);

	// Save the captured keyboard mapping
	const saveKeyboardMapping = async () => {
		if (mappingButtonIndex === null || capturedKeys.length === 0) return;

		const newKeyMappings = keyboardMappings.filter(k => k.buttonIndex !== mappingButtonIndex);
		newKeyMappings.push({ buttonIndex: mappingButtonIndex, keys: capturedKeys });

		await plugin.storage.setSynced('keyboardMappings', newKeyMappings);
		setKeyboardMappings(newKeyMappings);

		setMappingButtonIndex(null);
		setIsCapturingKeys(false);
		setCapturedKeys([]);
	};

	// Cancel mapping
	const cancelMapping = () => {
		setMappingButtonIndex(null);
		setIsCapturingKeys(false);
		setCapturedKeys([]);
	};

	// Get list of all button indices we care about
	const allButtonIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15].sort((a, b) => a - b);

	return (
		<div className="settings-container-v2">
			{/* Left Panel - Controller Display */}
			<SimpleGamepadOutline
				highlightedButton={buttonPressed ? buttonIndex : null}
				gamepadName={gamepadName}
			/>

			{/* Right Panel - Mappings List */}
			<div className="mappings-panel">
				<div className="panel-header">MAPPINGS</div>
				<div className="mappings-list">
					{allButtonIndices.map((btnIndex) => (
						<div
							key={btnIndex}
							className={`mapping-row ${buttonPressed && buttonIndex === btnIndex ? 'highlighted' : ''}`}
						>
							<span className="button-name">{getButtonLabel(btnIndex)}</span>
							<span className="mapping-value">{getKeyboardDisplay(btnIndex)}</span>
							<button
								className="map-btn"
								onClick={() => startMapping(btnIndex)}
							>
								Map
							</button>
						</div>
					))}
				</div>
			</div>

			{/* Keyboard Mapping Modal */}
			{isCapturingKeys && mappingButtonIndex !== null && (
				<div className="mapping-modal-overlay" onClick={cancelMapping}>
					<div className="mapping-modal" onClick={e => e.stopPropagation()}>
						<h3>Map {getButtonLabel(mappingButtonIndex)}</h3>
						<p>Press a key combination or select a quick action</p>

						{/* Quick Actions */}
						<div className="quick-actions">
							<button
								className={`quick-action-btn ${capturedKeys.join('') === 'Scroll Up' ? 'selected' : ''}`}
								onClick={() => setCapturedKeys(['Scroll Up'])}
							>
								⬆️ Scroll Up
							</button>
							<button
								className={`quick-action-btn ${capturedKeys.join('') === 'Scroll Down' ? 'selected' : ''}`}
								onClick={() => setCapturedKeys(['Scroll Down'])}
							>
								⬇️ Scroll Down
							</button>
						</div>

						<div className="divider-text">or press a key combination</div>

						<input
							ref={keyInputRef}
							type="text"
							className="key-capture-input"
							onKeyDown={handleKeyDown}
							value={capturedKeys.join(' + ')}
							placeholder="Press keys..."
							readOnly
						/>

						<div className="modal-buttons">
							<button className="cancel-btn" onClick={cancelMapping}>Cancel</button>
							<button
								className="save-btn"
								onClick={saveKeyboardMapping}
								disabled={capturedKeys.length === 0}
							>
								Save
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

renderWidget(GamePadSettingsUI);

export function convertKeyToQueueInteraction(key: string): QueueInteraction {
	return isNaN(Number(key)) ? (key as QueueInteraction) : (Number(key) as QueueInteraction);
}
