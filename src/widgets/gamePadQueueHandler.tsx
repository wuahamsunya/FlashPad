import { AppEvents, QueueEvent, renderWidget, useAPIEventListener, usePlugin } from '@remnote/plugin-sdk';
import { useCallback, useEffect, useState } from 'react';
import type { ControllerMapping } from './funcs/buttonMapping';
import { QueueInteraction } from './funcs/buttonMapping';
import { checkNonCardSlide } from './funcs/checkNonCardSlide';
import useGamepadInput from './funcs/gamePadInput';
import { LogType, logMessage } from './funcs/logging';

function GamepadInput() {
	const plugin = usePlugin();
	const [isGamepadEnabled, setIsGamepadEnabled] = useState(true);

	// Check if gamepad is enabled (auto-enable on iOS/iPadOS)
	useEffect(() => {
		async function checkEnabled() {
			const ua = navigator.userAgent;
			const platform = navigator.platform;
			const isMobile = /iPad|iPhone/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);

			if (isMobile) {
				// Always enabled on iOS/iPadOS
				setIsGamepadEnabled(true);
			} else {
				// Check user preference on desktop
				const enabled = await plugin.storage.getSynced('gamepadEnabled');
				setIsGamepadEnabled(enabled !== false);
			}
		}
		checkEnabled();
		// Also listen for changes
		const interval = setInterval(checkEnabled, 1000);
		return () => clearInterval(interval);
	}, [plugin]);

	if (!isGamepadEnabled) {
		return <div></div>;
	}

	return <GamepadLogic />;
}

function GamepadLogic() {
	const plugin = usePlugin();
	const {
		buttonIndex,
		buttonPressed,
		buttonReleased,
		setButtonPressed,
		setButtonReleased,
		releasedButtonIndex,
		controllerMapping,

	} = useGamepadInput();
	const [queueActionToTake, setQueueActionToTake] = useState<QueueInteraction | undefined>(
		undefined
	);
	const [isLookback, setIsLookback] = useState(false);
	const [isNonCardSlide, setIsCardSlide] = useState(false);

	const getSessionStatus = useCallback(async () => {
		return await plugin.storage.getSession('settingsUiShown');
	}, [plugin.storage]);

	useEffect(() => {
		if (buttonIndex === -1) {
			return;
		}
		const tmp = getButtonAction(buttonIndex, controllerMapping);
		if (tmp === undefined) {
			plugin.app.toast('⚠️ Unbound button. Please bind the button to an action in the settings.');
			return;
		}
		setQueueActionToTake(tmp);
	}, [buttonIndex, controllerMapping, plugin.app.toast]);

	useEffect(() => {
		if (buttonPressed) {
			logMessage(plugin, LogType.Info, false, `Button pressed: ${buttonIndex}`);
			setButtonPressed(false);
			plugin.messaging.broadcast({
				buttonGroup: getButtonGroup(buttonIndex, controllerMapping),
			});
		}
	}, [buttonPressed, buttonIndex, plugin, setButtonPressed, controllerMapping]);

	const fetchCardSlide = useCallback(async () => {
		const cardSlide = await plugin.queue.getCurrentQueueScreenType();
		if (cardSlide === undefined) {
			return;
		}
		setIsCardSlide(checkNonCardSlide(cardSlide));
	}, [plugin.queue]);

	const fetchLookback = useCallback(async () => {
		const lookback = await plugin.queue.inLookbackMode();
		setIsLookback(lookback || false);
	}, [plugin.queue]);

	useAPIEventListener(AppEvents.QueueLoadCard, undefined, async () => {
		fetchCardSlide();
		setTimeout(fetchLookback, 100);
	});

	useEffect(() => {
		fetchCardSlide();
		setTimeout(fetchLookback, 100);
	}, [fetchCardSlide, fetchLookback]);

	// Helper function to check if answer has been revealed
	const hasRevealedAnswer = useCallback(async () => {
		return await plugin.queue.hasRevealedAnswer();
	}, [plugin.queue]);

	useEffect(() => {
		getSessionStatus().then((status) => {
			if (status) {
				return;
			}
		});
		const handleButtonPress = async () => {
			if (buttonPressed && (await hasRevealedAnswer())) {
				const className = getActionFromButton(buttonIndex, controllerMapping);
				plugin.messaging.broadcast({ changeButtonCSS: className });
			}
		};

		handleButtonPress();
	}, [
		buttonPressed,
		buttonIndex,
		getSessionStatus,
		hasRevealedAnswer,
		controllerMapping,
		plugin.messaging.broadcast,
	]);

	// Handle button release event
	useEffect(() => {
		if (buttonReleased) {
			logMessage(plugin, LogType.Info, false, `Button released: ${releasedButtonIndex}`);
			setButtonReleased(false);
		}
	}, [buttonReleased, releasedButtonIndex, plugin, setButtonReleased]);

	// Show answer
	useEffect(() => {
		getSessionStatus().then((status) => {
			if (status) {
				return;
			}
		});
		const showAnswer = async () => {
			if (buttonReleased && !(await hasRevealedAnswer()) && !isLookback && !isNonCardSlide) {
				plugin.queue.showAnswer();
			}
		};
		showAnswer();
	}, [
		buttonReleased,
		isLookback,
		isNonCardSlide,
		getSessionStatus,
		hasRevealedAnswer,
		plugin.queue.showAnswer,
	]);

	// Rate current card (or perform scroll action)
	useEffect(() => {
		getSessionStatus().then((status) => {
			if (status) {
				return;
			}
		});

		// Handle scroll actions using keyboard simulation
		// Since we can't access parent DOM, we simulate keyboard events that RemNote might handle
		if (buttonReleased && queueActionToTake === QueueInteraction.scrollUp) {
			// Try dispatching keyboard events - RemNote might listen for these
			const keyboardEvents = [
				new KeyboardEvent('keydown', { key: 'PageUp', code: 'PageUp', keyCode: 33, bubbles: true, cancelable: true }),
				new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, bubbles: true, cancelable: true }),
			];

			for (const event of keyboardEvents) {
				document.dispatchEvent(event);
				document.body.dispatchEvent(event);
				// Also try on focused element
				if (document.activeElement) {
					document.activeElement.dispatchEvent(event);
				}
			}

			// Try postMessage as fallback
			try {
				window.parent.postMessage({ type: 'keydown', key: 'PageUp' }, '*');
			} catch (e) { /* ignore */ }

			return;
		}
		if (buttonReleased && queueActionToTake === QueueInteraction.scrollDown) {
			// Try dispatching keyboard events - RemNote might listen for these
			const keyboardEvents = [
				new KeyboardEvent('keydown', { key: 'PageDown', code: 'PageDown', keyCode: 34, bubbles: true, cancelable: true }),
				new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true, cancelable: true }),
			];

			for (const event of keyboardEvents) {
				document.dispatchEvent(event);
				document.body.dispatchEvent(event);
				// Also try on focused element
				if (document.activeElement) {
					document.activeElement.dispatchEvent(event);
				}
			}

			// Try postMessage as fallback
			try {
				window.parent.postMessage({ type: 'keydown', key: 'PageDown' }, '*');
			} catch (e) { /* ignore */ }

			return;
		}
		if (buttonReleased && (queueActionToTake === QueueInteraction.exitQueue || queueActionToTake === 'pressEscape' as any || queueActionToTake === 'exitQueue' as any)) {
			// Exit Queue is not supported by RemNote Plugin SDK
			// All attempts (queue.exit, window.setURL, closeFloatingWidgets, eval) are blocked
			plugin.app.toast('⚠️ Exit Queue: Press Escape on keyboard');
			return;
		}

		if (buttonReleased && queueActionToTake === QueueInteraction.goBackToPreviousCard) {
			plugin.queue.goBackToPreviousCard();
			return;
		}
		const rateCard = async () => {
			if (buttonReleased && ((await hasRevealedAnswer()) || isNonCardSlide)) {
				logMessage(
					plugin,
					LogType.Info,
					false,
					`Rating card as ${getActionFromButton(releasedButtonIndex, controllerMapping)}`
				);
				const action = getActionFromButton(releasedButtonIndex, controllerMapping);
				if (
					action !== undefined &&
					action !== QueueInteraction.hideAnswer &&
					action !== QueueInteraction.goBackToPreviousCard &&
					action !== QueueInteraction.scrollUp &&
					action !== QueueInteraction.scrollDown &&
					action !== QueueInteraction.exitQueue &&
					action !== 'pressEscape' as any && // Backward compatibility for old stored value
					action !== 'exitQueue' as any // Also check string value
				) {
					plugin.queue.rateCurrentCard(action as any);
				}
			}
		};
		plugin.messaging.broadcast({ changeButtonCSS: null });
		rateCard();
	}, [
		buttonReleased,
		isNonCardSlide,
		controllerMapping,
		hasRevealedAnswer,
		plugin.queue.rateCurrentCard,
		releasedButtonIndex,
		plugin.queue.goBackToPreviousCard,
		queueActionToTake,
		plugin.messaging.broadcast,
		getSessionStatus,
		plugin,
	]);
	return <div></div>;
}

renderWidget(GamepadInput);

function getButtonAction(buttonIndex: number, controllerMapping: ControllerMapping) {
	return controllerMapping.find((mapping) => mapping.buttonIndex === buttonIndex)?.queueInteraction;
}

function getButtonGroup(buttonIndex: number, controllerMapping: ControllerMapping) {
	return controllerMapping.find((mapping) => mapping.buttonIndex === buttonIndex)?.buttonGroup;
}

export function getActionFromButton(
	buttonIndex: number,
	controllerMapping: ControllerMapping
): QueueInteraction | undefined {
	return controllerMapping.find((mapping) => mapping.buttonIndex === buttonIndex)?.queueInteraction;
}
