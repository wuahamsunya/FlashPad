import { QueueInteractionScore, RNPlugin } from '@remnote/plugin-sdk';
import { LogType, logMessage } from './logging';

// Enum for Queue Interactions
export enum QueueInteraction {
	hideAnswer = 'hideAnswer',
	goBackToPreviousCard = 'goBackToPreviousCard',
	scrollUp = 'scrollUp',
	scrollDown = 'scrollDown',
	exitQueue = 'exitQueue',
	answerCardAsAgain = QueueInteractionScore.AGAIN,
	answerCardAsEasy = QueueInteractionScore.EASY,
	answerCardAsGood = QueueInteractionScore.GOOD,
	answerCardAsHard = QueueInteractionScore.HARD,
	answerCardAsTooEarly = QueueInteractionScore.TOO_EARLY,
	answerCardAsViewedAsLeech = QueueInteractionScore.VIEWED_AS_LEECH,
	resetCard = QueueInteractionScore.RESET,
}

export const QueueInteractionPrettyName: Record<QueueInteraction, string> = {
	[QueueInteraction.hideAnswer]: 'Hide Answer',
	[QueueInteraction.goBackToPreviousCard]: 'Go Back To Previous Card',
	[QueueInteraction.scrollUp]: 'Scroll Up',
	[QueueInteraction.scrollDown]: 'Scroll Down',
	[QueueInteraction.exitQueue]: 'Exit Queue',
	[QueueInteraction.answerCardAsAgain]: 'Answer Card As Again',
	[QueueInteraction.answerCardAsEasy]: 'Answer Card As Easy',
	[QueueInteraction.answerCardAsGood]: 'Answer Card As Good',
	[QueueInteraction.answerCardAsHard]: 'Answer Card As Hard',
	[QueueInteraction.answerCardAsTooEarly]: 'Answer Card As Too Early',
	[QueueInteraction.answerCardAsViewedAsLeech]: 'Answer Card As Viewed As Leech',
	[QueueInteraction.resetCard]: 'Reset Card',
};

// Enum for Button Groups
export enum ButtonGroup {
	triggerBumper = 'trigger/bumper',
	dPad = 'd-pad',
	faceButton = 'face button',
}

export interface ButtonMapping {
	buttonIndex: number;
	queueInteraction: QueueInteraction;
	buttonGroup: ButtonGroup;
	buttonLabel: string;
}

export type ControllerMapping = ButtonMapping[];

// Parse vendor and product ID from gamepad.id string
// Example formats:
// - "Xbox 360 Controller (Vendor: 045e Product: 028e)"
// - "045e-028e-Xbox 360 Controller"
// - "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)"
export function parseGamepadId(gamepadId: string): { vendorId: string; productId: string } | null {
	// Try "Vendor: xxxx Product: xxxx" format
	const vendorMatch = gamepadId.match(/Vendor:\s*([0-9a-fA-F]+)/i);
	const productMatch = gamepadId.match(/Product:\s*([0-9a-fA-F]+)/i);

	if (vendorMatch && productMatch) {
		return { vendorId: vendorMatch[1].toLowerCase(), productId: productMatch[1].toLowerCase() };
	}

	// Try "xxxx-xxxx-Name" format (common on some systems)
	const dashMatch = gamepadId.match(/^([0-9a-fA-F]{4})-([0-9a-fA-F]{4})/);
	if (dashMatch) {
		return { vendorId: dashMatch[1].toLowerCase(), productId: dashMatch[2].toLowerCase() };
	}

	return null;
}

// Generate storage key for device-specific mapping
export function getDeviceMappingKey(vendorId: string, productId: string): string {
	return `controllerMapping_${vendorId}_${productId}`;
}

// Get device-specific mapping from storage, with fallback to legacy global mapping
export async function getDeviceMapping(
	plugin: RNPlugin,
	gamepadId: string | null
): Promise<{ mapping: ControllerMapping; deviceKey: string | null }> {
	// Try device-specific mapping first
	if (gamepadId) {
		const deviceInfo = parseGamepadId(gamepadId);
		if (deviceInfo) {
			const deviceKey = getDeviceMappingKey(deviceInfo.vendorId, deviceInfo.productId);
			const deviceMapping = (await plugin.storage.getSynced(deviceKey)) as ControllerMapping;
			if (deviceMapping && Array.isArray(deviceMapping) && deviceMapping.length > 0) {
				return { mapping: deviceMapping, deviceKey };
			}
		}
	}

	// Fall back to legacy global mapping
	const legacyMapping = (await plugin.storage.getSynced('controllerMapping')) as ControllerMapping;
	if (legacyMapping && Array.isArray(legacyMapping) && legacyMapping.length > 0) {
		return { mapping: legacyMapping, deviceKey: null };
	}

	// Fall back to default
	return { mapping: DEFAULT_MAPPING, deviceKey: null };
}

// Save device-specific mapping to storage
export async function saveDeviceMapping(
	plugin: RNPlugin,
	gamepadId: string | null,
	mapping: ControllerMapping
): Promise<string | null> {
	if (gamepadId) {
		const deviceInfo = parseGamepadId(gamepadId);
		if (deviceInfo) {
			const deviceKey = getDeviceMappingKey(deviceInfo.vendorId, deviceInfo.productId);
			await plugin.storage.setSynced(deviceKey, mapping);
			plugin.messaging.broadcast({ type: 'controllerMappingUpdated', deviceKey });
			return deviceKey;
		}
	}

	// Fall back to legacy global key if no device info available
	await plugin.storage.setSynced('controllerMapping', mapping);
	plugin.messaging.broadcast({ type: 'controllerMappingUpdated' });
	return null;
}


// Default Mapping
export const DEFAULT_MAPPING: ControllerMapping = [
	{
		buttonIndex: 3,
		queueInteraction: QueueInteraction.answerCardAsAgain,
		buttonGroup: ButtonGroup.faceButton,
		buttonLabel: 'North Button',
	},
	{
		buttonIndex: 12,
		queueInteraction: QueueInteraction.answerCardAsAgain,
		buttonGroup: ButtonGroup.dPad,
		buttonLabel: 'North D-Pad',
	},
	{
		buttonIndex: 6,
		queueInteraction: QueueInteraction.answerCardAsAgain,
		buttonGroup: ButtonGroup.triggerBumper,
		buttonLabel: 'Left Trigger',
	},
	{
		buttonIndex: 0,
		queueInteraction: QueueInteraction.answerCardAsEasy,
		buttonGroup: ButtonGroup.faceButton,
		buttonLabel: 'South Button',
	},
	{
		buttonIndex: 13,
		queueInteraction: QueueInteraction.answerCardAsEasy,
		buttonGroup: ButtonGroup.dPad,
		buttonLabel: 'South D-Pad',
	},
	{
		buttonIndex: 7,
		queueInteraction: QueueInteraction.answerCardAsEasy,
		buttonGroup: ButtonGroup.triggerBumper,
		buttonLabel: 'Right Trigger',
	},
	{
		buttonIndex: 1,
		queueInteraction: QueueInteraction.answerCardAsGood,
		buttonGroup: ButtonGroup.faceButton,
		buttonLabel: 'East Button',
	},
	{
		buttonIndex: 15,
		queueInteraction: QueueInteraction.answerCardAsGood,
		buttonGroup: ButtonGroup.dPad,
		buttonLabel: 'East D-Pad',
	},
	{
		buttonIndex: 5,
		queueInteraction: QueueInteraction.answerCardAsGood,
		buttonGroup: ButtonGroup.triggerBumper,
		buttonLabel: 'Right Bumper',
	},
	{
		buttonIndex: 2,
		queueInteraction: QueueInteraction.answerCardAsHard,
		buttonGroup: ButtonGroup.faceButton,
		buttonLabel: 'West Button',
	},
	{
		buttonIndex: 14,
		queueInteraction: QueueInteraction.answerCardAsHard,
		buttonGroup: ButtonGroup.dPad,
		buttonLabel: 'West D-Pad',
	},
	{
		buttonIndex: 4,
		queueInteraction: QueueInteraction.answerCardAsHard,
		buttonGroup: ButtonGroup.triggerBumper,
		buttonLabel: 'Left Bumper',
	},
	{
		buttonIndex: 8,
		queueInteraction: QueueInteraction.answerCardAsTooEarly,
		buttonGroup: ButtonGroup.triggerBumper,
		buttonLabel: 'Select Button',
	},
	{
		buttonIndex: 9,
		queueInteraction: QueueInteraction.goBackToPreviousCard,
		buttonGroup: ButtonGroup.triggerBumper,
		buttonLabel: 'Start Button',
	},
];

export function getPossibleButtonsFromGroup(buttonGroup: ButtonGroup): number[] {
	return DEFAULT_MAPPING.filter((mapping) => mapping.buttonGroup === buttonGroup).map(
		(mapping) => mapping.buttonIndex
	);
}

// Logging Function
function logMappingChange(
	plugin: RNPlugin,
	buttonLabel: string,
	newQueueInteraction: QueueInteraction,
	oldQueueInteraction: QueueInteraction
) {
	logMessage(
		plugin,
		LogType.Info,
		false,
		`Button mapping for ${buttonLabel} has been changed to ${QueueInteractionPrettyName[newQueueInteraction]}`,
		`| Default was: ${QueueInteractionPrettyName[oldQueueInteraction]}`
	);
}

// Delete or Swap Button Mapping for a Button (pass in the button we want to swap and the new interaction)
// the function will delete the old mapping for the button and add the new mapping, and if we are asked to swap, it will swap the old mapping's interaction with the new one
// If gamepadId is provided, saves to device-specific storage key
export async function deleteOrSwapButtonMapping(
	plugin: RNPlugin,
	buttonIndex: number,
	newQueueInteraction: QueueInteraction,
	swap: boolean,
	gamepadId?: string | null
) {
	// Get the appropriate storage key and current mapping
	let storageKey = 'controllerMapping';
	let controllerMapping: ControllerMapping;

	if (gamepadId) {
		const deviceInfo = parseGamepadId(gamepadId);
		if (deviceInfo) {
			storageKey = getDeviceMappingKey(deviceInfo.vendorId, deviceInfo.productId);
		}
	}

	// Try to get existing mapping from the appropriate key
	const existingMapping = (await plugin.storage.getSynced(storageKey)) as ControllerMapping;
	if (existingMapping && Array.isArray(existingMapping) && existingMapping.length > 0) {
		controllerMapping = existingMapping;
	} else {
		// Initialize with default mapping if none exists
		controllerMapping = [...DEFAULT_MAPPING];
	}

	const oldMapping = controllerMapping.find((mapping) => mapping.buttonIndex === buttonIndex);

	if (!oldMapping) {
		logMessage(
			plugin,
			LogType.Warning,
			false,
			`Button mapping for button index ${buttonIndex} does not exist. Adding new mapping.`
		);
		controllerMapping.push({
			buttonIndex,
			queueInteraction: newQueueInteraction,
			buttonGroup: DEFAULT_MAPPING.find((mapping) => mapping.buttonIndex === buttonIndex)
				?.buttonGroup!,
			buttonLabel: DEFAULT_MAPPING.find((mapping) => mapping.buttonIndex === buttonIndex)
				?.buttonLabel!,
		});
	} else {
		const oldQueueInteraction = oldMapping.queueInteraction;
		if (swap) {
			oldMapping.queueInteraction = newQueueInteraction;
			logMappingChange(plugin, oldMapping.buttonLabel, newQueueInteraction, oldQueueInteraction);
		} else {
			controllerMapping.splice(
				controllerMapping.findIndex((mapping) => mapping.buttonIndex === buttonIndex),
				1
			);
			controllerMapping.push({
				buttonIndex,
				queueInteraction: newQueueInteraction,
				buttonGroup: DEFAULT_MAPPING.find((mapping) => mapping.buttonIndex === buttonIndex)
					?.buttonGroup!,
				buttonLabel: DEFAULT_MAPPING.find((mapping) => mapping.buttonIndex === buttonIndex)
					?.buttonLabel!,
			});
		}
	}

	await plugin.storage.setSynced(storageKey, controllerMapping);
	plugin.messaging.broadcast({ type: 'controllerMappingUpdated', storageKey });
}

// Write Settings to Synced Mapping
export async function writeSettingsToSyncedMapping(plugin: RNPlugin) {
	const controllerMapping: ControllerMapping = [];

	for (const button of DEFAULT_MAPPING) {
		const queueInteraction = await plugin.settings.getSetting(
			`button-mapping-${button.buttonLabel}`
		);

		if (!queueInteraction) {
			logMessage(
				plugin,
				LogType.Warning,
				false,
				`Button mapping for ${button.buttonLabel} is not set. Using default value.`
			);
			controllerMapping.push(button);
			continue;
		}

		// Ensuring queueInteractionParsed is of type QueueInteraction
		let queueInteractionParsed: QueueInteraction;
		if (typeof queueInteraction === 'string' && !isNaN(Number(queueInteraction))) {
			queueInteractionParsed = Number(queueInteraction) as QueueInteraction;
		} else {
			queueInteractionParsed = queueInteraction as QueueInteraction;
		}

		controllerMapping.push({
			buttonIndex: button.buttonIndex,
			queueInteraction: queueInteractionParsed,
			buttonGroup: button.buttonGroup,
			buttonLabel: button.buttonLabel,
		});
	}

	const changedMappings = controllerMapping.filter(
		(mapping) =>
			DEFAULT_MAPPING.find((defaultMapping) => defaultMapping.buttonIndex === mapping.buttonIndex)
				?.queueInteraction !== mapping.queueInteraction
	);

	changedMappings.forEach((mapping) => {
		const defaultMapping = DEFAULT_MAPPING.find(
			(defaultMapping) => defaultMapping.buttonIndex === mapping.buttonIndex
		);
		if (defaultMapping) {
			logMappingChange(
				plugin,
				mapping.buttonLabel,
				mapping.queueInteraction,
				defaultMapping.queueInteraction
			);
		}
	});

	await plugin.storage.setSynced('controllerMapping', controllerMapping);
	plugin.messaging.broadcast({ type: 'controllerMappingUpdated' });
}
