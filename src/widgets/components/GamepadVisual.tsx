import React from 'react';

interface SimpleGamepadOutlineProps {
	highlightedButton: number | null;
	gamepadName?: string;
}

// Simplified gamepad outline with button positions for highlighting
const BUTTON_HIGHLIGHTS: Record<number, { cx: number; cy: number; r: number }> = {
	// Face buttons (right side)
	0: { cx: 280, cy: 85, r: 10 },  // South (A)
	1: { cx: 300, cy: 65, r: 10 },  // East (B)
	2: { cx: 260, cy: 65, r: 10 },  // West (X)
	3: { cx: 280, cy: 45, r: 10 },  // North (Y)
	// D-pad
	12: { cx: 80, cy: 45, r: 8 },   // Up
	13: { cx: 80, cy: 85, r: 8 },   // Down
	14: { cx: 60, cy: 65, r: 8 },   // Left
	15: { cx: 100, cy: 65, r: 8 },  // Right
	// Bumpers & Triggers
	4: { cx: 50, cy: 10, r: 12 },   // Left Bumper
	5: { cx: 310, cy: 10, r: 12 },  // Right Bumper
	6: { cx: 50, cy: -10, r: 12 },  // Left Trigger
	7: { cx: 310, cy: -10, r: 12 }, // Right Trigger
	// Center
	8: { cx: 145, cy: 55, r: 8 },   // Select
	9: { cx: 215, cy: 55, r: 8 },   // Start
	// Analog sticks
	10: { cx: 130, cy: 100, r: 15 }, // Left Stick Click
	11: { cx: 230, cy: 100, r: 15 }, // Right Stick Click
};

export function SimpleGamepadOutline({ highlightedButton, gamepadName }: SimpleGamepadOutlineProps) {
	return (
		<div className="device-panel">
			<div className="panel-header">CONNECTED DEVICE</div>
			<div className="device-name">{gamepadName || 'No controller detected'}</div>
			<svg viewBox="-10 -25 380 180" className="gamepad-outline-svg">
				{/* Main body outline */}
				<path
					d="M 30 20 
					   Q 0 20 0 60 
					   Q 0 140 40 145 
					   L 70 145 
					   Q 100 145 105 120 
					   L 110 95 
					   Q 115 80 130 75 
					   L 150 70 
					   Q 180 60 210 70 
					   L 230 75 
					   Q 245 80 250 95 
					   L 255 120 
					   Q 260 145 290 145 
					   L 320 145 
					   Q 360 140 360 60 
					   Q 360 20 330 20 
					   L 30 20 Z"
					fill="none"
					stroke="#4a5568"
					strokeWidth="3"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>

				{/* D-pad cross */}
				<rect x="70" y="40" width="20" height="50" rx="3" fill="none" stroke="#4a5568" strokeWidth="2" />
				<rect x="50" y="55" width="60" height="20" rx="3" fill="none" stroke="#4a5568" strokeWidth="2" />

				{/* Face buttons circle layout */}
				<circle cx="280" cy="45" r="10" fill="none" stroke="#4a5568" strokeWidth="2" />
				<circle cx="300" cy="65" r="10" fill="none" stroke="#4a5568" strokeWidth="2" />
				<circle cx="260" cy="65" r="10" fill="none" stroke="#4a5568" strokeWidth="2" />
				<circle cx="280" cy="85" r="10" fill="none" stroke="#4a5568" strokeWidth="2" />

				{/* Center buttons */}
				<rect x="135" cy="45" width="20" height="12" rx="3" fill="none" stroke="#4a5568" strokeWidth="2" />
				<rect x="205" cy="45" width="20" height="12" rx="3" fill="none" stroke="#4a5568" strokeWidth="2" />

				{/* Analog sticks */}
				<circle cx="130" cy="100" r="20" fill="none" stroke="#4a5568" strokeWidth="2" />
				<circle cx="130" cy="100" r="12" fill="none" stroke="#4a5568" strokeWidth="1.5" />
				<circle cx="230" cy="100" r="20" fill="none" stroke="#4a5568" strokeWidth="2" />
				<circle cx="230" cy="100" r="12" fill="none" stroke="#4a5568" strokeWidth="1.5" />

				{/* Bumpers */}
				<rect x="25" y="0" width="50" height="15" rx="4" fill="none" stroke="#4a5568" strokeWidth="2" />
				<rect x="285" y="0" width="50" height="15" rx="4" fill="none" stroke="#4a5568" strokeWidth="2" />

				{/* Highlight for pressed button */}
				{highlightedButton !== null && BUTTON_HIGHLIGHTS[highlightedButton] && (
					<circle
						cx={BUTTON_HIGHLIGHTS[highlightedButton].cx}
						cy={BUTTON_HIGHLIGHTS[highlightedButton].cy}
						r={BUTTON_HIGHLIGHTS[highlightedButton].r + 4}
						fill="#22c55e"
						opacity="0.8"
						className="button-highlight-pulse"
					/>
				)}
			</svg>
		</div>
	);
}

export default SimpleGamepadOutline;
