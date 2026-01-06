import { useEffect, useRef, useState, useCallback } from 'react';
import { AppEvents, usePlugin } from '@remnote/plugin-sdk';
import { ControllerMapping, DEFAULT_MAPPING, getDeviceMapping, parseGamepadId } from './buttonMapping';
import { logMessage, LogType } from './logging';

export interface GamepadDeviceInfo {
	id: string;
	vendorId: string | null;
	productId: string | null;
}

function useGamepadInput() {
	const plugin = usePlugin();
	const gamepadIndex = useRef(-1);
	const [buttonReleased, setButtonReleased] = useState(false);
	const [buttonPressed, setButtonPressed] = useState(false);
	const [buttonIndex, setButtonIndex] = useState(-1);
	const prevButtonStates = useRef<Array<boolean>>([]);
	const [releasedButtonIndex, setReleasedButtonIndex] = useState(-1);
	const [controllerMapping, setControllerMapping] = useState<ControllerMapping>(DEFAULT_MAPPING);
	const [currentGamepadId, setCurrentGamepadId] = useState<string | null>(null);
	const [deviceInfo, setDeviceInfo] = useState<GamepadDeviceInfo | null>(null);

	// Fetch controller mapping based on current device
	const fetchControllerMapping = useCallback(async (gamepadId: string | null) => {
		const result = await getDeviceMapping(plugin, gamepadId);
		logMessage(plugin, LogType.Info, false, `Fetched controller mapping for device ${gamepadId}: `, result.mapping);
		setControllerMapping(result.mapping);
	}, [plugin]);

	// Initial fetch and listen for updates
	useEffect(() => {
		fetchControllerMapping(currentGamepadId);

		const listener = plugin.event.addListener(AppEvents.MessageBroadcast, undefined, async (message) => {
			if (message.message.type === 'controllerMappingUpdated') {
				logMessage(plugin, LogType.Info, false, 'Received controller mapping update event');
				fetchControllerMapping(currentGamepadId);
			}
		});

		return () => {
			// Cleanup listener if possible
		};
	}, [plugin, currentGamepadId, fetchControllerMapping]);

	useEffect(() => {
		const startGamepadInputListener = () => {
			const interval = setInterval(() => {
				const gamepads = navigator.getGamepads();
				const gamepad = gamepads[gamepadIndex.current];
				if (gamepad) {
					gamepad.buttons.forEach((button, index) => {
						if (button.pressed && !prevButtonStates.current[index]) {
							setButtonIndex(index);
							setButtonPressed(true);
						} else if (!button.pressed && prevButtonStates.current[index]) {
							setReleasedButtonIndex(index);
							setButtonIndex(-1);
							setButtonReleased(true);
						}
						prevButtonStates.current[index] = button.pressed;
					});
				}
			}, 1);

			return () => clearInterval(interval);
		};

		const handleGamepadConnected = (event: {
			gamepad: {
				mapping: string;
				index: number;
				id: string;
			};
		}) => {

			gamepadIndex.current = event.gamepad.index;

			// Parse and store device info
			const gamepadId = event.gamepad.id;
			setCurrentGamepadId(gamepadId);

			const parsed = parseGamepadId(gamepadId);
			setDeviceInfo({
				id: gamepadId,
				vendorId: parsed?.vendorId || null,
				productId: parsed?.productId || null,
			});

			logMessage(plugin, LogType.Info, false, `Gamepad connected: ${gamepadId}`, parsed ? `(Vendor: ${parsed.vendorId}, Product: ${parsed.productId})` : '(Could not parse vendor/product)');

			// Fetch device-specific mapping
			fetchControllerMapping(gamepadId);

			startGamepadInputListener();
		};

		const handleGamepadDisconnected = () => {
			setCurrentGamepadId(null);
			setDeviceInfo(null);
			gamepadIndex.current = -1;
		};

		window.addEventListener('gamepadconnected', handleGamepadConnected);
		window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);

		return () => {
			window.removeEventListener('gamepadconnected', handleGamepadConnected);
			window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected);
		};
	}, [plugin, fetchControllerMapping]);

	return {
		buttonIndex,
		buttonPressed,
		buttonReleased,
		setButtonPressed,
		setButtonReleased,
		releasedButtonIndex,
		controllerMapping,
		currentGamepadId,
		deviceInfo,
	};
}

export default useGamepadInput;
