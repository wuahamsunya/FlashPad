import {
	AppEvents,
	declareIndexPlugin,
	QueueInteractionScore,
	ReactRNPlugin,
	RNPlugin,
	useOnMessageBroadcast,
	WidgetLocation,
} from '@remnote/plugin-sdk';
import {
	QueueInteraction,
	QueueInteractionPrettyName,
	ButtonGroup,
	DEFAULT_MAPPING,
	writeSettingsToSyncedMapping,
	getPossibleButtonsFromGroup,
	ControllerMapping,
	ButtonMapping,
} from './funcs/buttonMapping';
import { getResponseButtonUI as getButtonClassName } from './funcs/getResponseButtonUIforGCButtonPressed';
import { getAllSessionLogs, logMessage, LogType } from './funcs/logging';
import { useEffect } from 'react';

export const QueueInteractionCSSClassName: Record<QueueInteraction, string> = {
	[QueueInteraction.answerCardAsAgain]: 'rn-queue-press-tooltip-forgot',
	[QueueInteraction.answerCardAsEasy]: 'rn-queue-press-tooltip-remembered',
	[QueueInteraction.answerCardAsGood]: 'rn-queue-press-tooltip-recalled-with-effort',
	[QueueInteraction.answerCardAsHard]: 'rn-queue-press-tooltip-partially-recalled',
	[QueueInteraction.answerCardAsTooEarly]: 'rn-queue-press-tooltip-skip',
	[QueueInteraction.hideAnswer]: '',
	[QueueInteraction.goBackToPreviousCard]: '',
	[QueueInteraction.scrollUp]: '',
	[QueueInteraction.scrollDown]: '',
	[QueueInteraction.exitQueue]: '',
	[QueueInteraction.answerCardAsViewedAsLeech]: '',
	[QueueInteraction.resetCard]: '',
};

const buttonLabels = DEFAULT_MAPPING.map((mapping) => mapping.buttonLabel);

async function onActivate(plugin: ReactRNPlugin) {
	// ensure the default mapping is entered into the storage
	if ((await plugin.storage.getSynced('controllerMapping')) == undefined) {
		await plugin.storage.setSynced('controllerMapping', DEFAULT_MAPPING);
	}

	await plugin.settings.registerBooleanSetting({
		id: 'debug-mode',
		title: 'Debug Mode (Gamepad)',
		description: 'Enables certain testing commands. Non-destructive.',
		defaultValue: false,
	});

	// for (const button of DEFAULT_MAPPING) {
	// 	const options = Object.entries(QueueInteractionPrettyName).map(([key, value]) => ({
	// 		key: key,
	// 		value: key,
	// 		label: value,
	// 	}));

	// 	await plugin.settings.registerDropdownSetting({
	// 		id: `button-mapping-${button.buttonLabel}`,
	// 		title: `Button Mapping for ${button.buttonLabel}`,
	// 		defaultValue: button.queueInteraction.toString(),
	// 		description: `Change the response for the ${button.buttonLabel}.`,
	// 		options: options,
	// 	});
	// }

	plugin.track(async (reactivePlugin) => {
		await isDebugMode(reactivePlugin).then(async (debugMode) => {
			if (debugMode) {
				plugin.app.toast('Debug Mode Enabled; Registering Debug Tools');
				await plugin.app.registerCommand({
					id: 'log-values',
					name: 'Log Values',
					description: 'Log the values of certain variables',
					quickCode: 'debug log',
					action: async () => {
						// log values
					},
				});
				// force set default mapping (command)
				await plugin.app.registerCommand({
					id: 'force-set-default-mapping',
					name: 'Force Set Default Mapping',
					description: 'Force set the default mapping',
					quickCode: 'debug force set default mapping',
					action: async () => {
						await reactivePlugin.storage.setSynced('controllerMapping', DEFAULT_MAPPING);
						plugin.app.toast('Default Mapping Set');
					},
				});
				// write settings to synced mapping
				await plugin.app.registerCommand({
					id: 'write-settings-to-synced-mapping',
					name: 'Write Settings to Synced Mapping',
					description: 'Write the settings to the synced mapping',
					quickCode: 'debug write settings to synced mapping',
					action: async () => {
						await writeSettingsToSyncedMapping(reactivePlugin);
					},
				});
				// copy logs to clipboard
				await plugin.app.registerCommand({
					id: 'copy-logs-to-clipboard',
					name: 'Copy Logs to Clipboard',
					description: 'Copy the logs to the clipboard',
					quickCode: 'debug copy logs to clipboard',
					action: async () => {
						await getAllSessionLogs(plugin);
					},
				});
			}
		});
		// await writeSettingsToSyncedMapping(reactivePlugin);
	});

	await plugin.app.registerWidget('gamePadQueueHandler', WidgetLocation.QueueToolbar, {
		// @ts-ignore
		dimensions: { height: '0px', width: '0px' },
	});

	// Register Queue Stats Widget (Queue Motivator) - in Queue Toolbar (always visible)
	await plugin.app.registerWidget('QueueStatsWidget', WidgetLocation.QueueToolbar, {
		dimensions: { height: 'auto', width: 'auto' },
	});

	await plugin.app.registerWidget('settingsUI', WidgetLocation.Popup, {
		dimensions: { height: 'auto', width: '80vw' },
	});

	await plugin.app.registerCommand({
		id: 'open-settings-ui',
		name: 'Customize Controls (Gamepad)',
		description: 'Open the settings UI for the button mappings',
		action: async () => {
			await plugin.widget.openPopup('settingsUI');
		},
	});

	// === Queue Stats (Motivator) Event Listeners ===
	let queueStartTime = 0;
	let totalCardsCompleted = 0;
	let totalTimeSpent = 0;
	let totalAgainCount = 0;

	// Reset stats on queue enter
	plugin.event.addListener(AppEvents.QueueEnter, undefined, async () => {
		queueStartTime = Date.now();
		totalCardsCompleted = 0;
		totalTimeSpent = 0;
		totalAgainCount = 0;

		await plugin.storage.setSession('queueStats_cardPerMinute', 0);
		await plugin.storage.setSession('queueStats_remainingTime', '∞');
		await plugin.storage.setSession('queueStats_totalCardsCompleted', 0);
		await plugin.storage.setSession('queueStats_totalTimeSpent', 0);
		await plugin.storage.setSession('queueStats_totalAgainCount', 0);
		await plugin.storage.setSession('queueStats_expectedCompletionTime', '');

		// Fix padding and ensure visibility in Expanded Mode (Image Occlusion) using CSS injection
		// We cannot remove the class 'p-4' directly due to iframe security, so we override it with CSS
		// We also add z-index to make sure it shows above the IO overlay
		await plugin.app.registerCSS('fixQueuePadding', `
			.rn-queue__top-bar--right {
				padding: 0px !important;
				z-index: 200 !important;
				position: relative !important;
			}
		`);
	});

	// Track time on reveal
	plugin.event.addListener(AppEvents.RevealAnswer, undefined, async () => {
		if (queueStartTime) {
			const endTime = Date.now();
			const timeDiff = (endTime - queueStartTime) / 1000;
			totalTimeSpent += timeDiff;
			queueStartTime = endTime;
			await plugin.storage.setSession('queueStats_totalTimeSpent', (totalTimeSpent / 60));
		}
	});

	// Update stats on card completion
	plugin.event.addListener(AppEvents.QueueCompleteCard, undefined, async (data) => {
		const isAgain = (data as any).score === QueueInteractionScore.AGAIN;

		// Always count completed cards
		totalCardsCompleted++;

		// Also track "Again" cards separately
		if (isAgain) {
			totalAgainCount++;
		}

		const totalCardsInDeckRemain = await plugin.queue.getNumRemainingCards();

		// Calculate CPM based on successful (non-Again) cards only for "learning speed"
		const successfulCards = totalCardsCompleted - totalAgainCount;
		const successCpm = totalTimeSpent > 0 && successfulCards > 0
			? parseFloat((successfulCards / (totalTimeSpent / 60)).toFixed(2))
			: 0;

		// Calculate overall CPM (all reviews including Again) for ETA
		const overallCpm = totalTimeSpent > 0 && totalCardsCompleted > 0
			? parseFloat((totalCardsCompleted / (totalTimeSpent / 60)).toFixed(2))
			: 0;

		// Calculate remaining time
		let remainingTime = '∞';
		let expectedCompletionTime = '';

		if (overallCpm > 0 && totalCardsInDeckRemain !== undefined && totalCardsInDeckRemain > 0) {
			// Simple approach: remaining cards / cards per minute
			// This assumes future performance similar to current session
			const remainingMinutes = totalCardsInDeckRemain / overallCpm;

			if (isFinite(remainingMinutes) && remainingMinutes > 0) {
				const hours = Math.floor(remainingMinutes / 60);
				const minutes = Math.floor(remainingMinutes % 60);
				const seconds = Math.floor((remainingMinutes * 60) % 60);
				remainingTime = hours > 0
					? `${hours}h ${minutes}m`
					: `${minutes}m ${seconds}s`;

				// Expected completion time with AM/PM
				const now = new Date();
				now.setMinutes(now.getMinutes() + remainingMinutes);
				expectedCompletionTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
			}
		}

		// Update session storage
		await plugin.storage.setSession('queueStats_cardPerMinute', successCpm);
		await plugin.storage.setSession('queueStats_remainingTime', remainingTime);
		await plugin.storage.setSession('queueStats_totalCardsCompleted', totalCardsCompleted);
		await plugin.storage.setSession('queueStats_totalTimeSpent', (totalTimeSpent / 60));
		await plugin.storage.setSession('queueStats_totalAgainCount', totalAgainCount);
		await plugin.storage.setSession('queueStats_expectedCompletionTime', expectedCompletionTime);
	});

	plugin.event.addListener(AppEvents.MessageBroadcast, undefined, async (message) => {
		if (message.message.changeButtonCSS === undefined || message.message.changeButtonCSS === null) {
			await plugin.app.registerCSS('hoverButton', '');
		}



		// 		if (message.message.buttonGroup) {
		// 			const oldGroup = await plugin.storage.getSession('buttonGroup');
		// 			if (oldGroup === message.message.buttonGroup) {
		// 				return;
		// 			}
		// 			await plugin.storage.setSession('buttonGroup', message.message.buttonGroup);
		// 			// Get the CSS pattern for the current button group
		// 			const buttonGroup = message.message.buttonGroup as ButtonGroup;

		// 			// we're going to return the css pattern for all the response buttons.
		// 			// the css will be populated with the mapping information we will get
		// 			// (to find the css class, use the QueueInteractionCSSClassName object)
		// 			// in the css class we find, do ::after { content: " ${buttonLabel}"; } (but show all the possible labels)

		// 			let cssPattern = '';
		// 			const buttons = getPossibleButtonsFromGroup(buttonGroup);
		// 			const controllerMapping = (await plugin.storage.getSynced(
		// 				'controllerMapping'
		// 			)) as ControllerMapping;
		// 			for (const buttonAsString of buttons) {
		// 				const button = Number(buttonAsString);
		// 				const buttonLabel = buttonLabels[button];
		// 				const buttonObject = controllerMapping.find(
		// 					(mapping) => mapping.buttonIndex === button
		// 				) as ButtonMapping;
		// 				const cssClass = QueueInteractionCSSClassName[buttonObject.queueInteraction];
		// 				cssPattern += `
		// 					.${cssClass}::after {
		// 						content: " | On your Gamepad: ${buttonLabel}";
		// 					}
		// 				`;
		// 			}
		// 			// manually add the user's bindings for the start and select buttons
		// 			cssPattern += `
		// 				[data-cy-label="Back"] .rn-text-paragraph-medium::after {
		//     content: " | On your Gamepad: Start Button";
		// }
		// 				.${QueueInteractionCSSClassName[QueueInteraction.answerCardAsTooEarly]}::after {
		// 					content: " | On your Gamepad: Select Button";
		// 				}
		// 			`;

		// 			// Apply the CSS pattern
		// 			if (cssPattern) {
		// 				await plugin.app.registerCSS('buttonGroupCSS', cssPattern);
		// 			}
		// 		}

		if (message.message.changeButtonCSS !== undefined && message.message.changeButtonCSS !== null) {
			const changeButtonCSS = Number(message.message.changeButtonCSS);
			await plugin.app.registerCSS('hoverButton', '');
			await plugin.app.registerCSS(
				'hoverButton',
				`.${getButtonClassName(changeButtonCSS)} { background: var(--rn-clr-background--hovered) !important;}`
			);
		}
	});
}
async function isDebugMode(reactivePlugin: RNPlugin): Promise<boolean> {
	return await reactivePlugin.settings.getSetting('debug-mode');
}

async function onDeactivate(_: ReactRNPlugin) { }

declareIndexPlugin(onActivate, onDeactivate);
