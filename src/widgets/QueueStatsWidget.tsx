import { renderWidget, usePlugin, useSessionStorageState } from '@remnote/plugin-sdk';
import React, { useEffect, useState } from 'react';
import './App.css';

function QueueStatsWidget() {
    const plugin = usePlugin();
    const [cardPerMinute] = useSessionStorageState<number>('queueStats_cardPerMinute', 0);
    const [remainingTime] = useSessionStorageState<string>('queueStats_remainingTime', '∞');
    const [totalCardsCompleted] = useSessionStorageState<number>('queueStats_totalCardsCompleted', 0);
    const [totalTimeSpent] = useSessionStorageState<number>('queueStats_totalTimeSpent', 0);
    const [totalAgainCount] = useSessionStorageState<number>('queueStats_totalAgainCount', 0);
    const [expectedCompletionTime] = useSessionStorageState<string>('queueStats_expectedCompletionTime', '');
    const [currentTime, setCurrentTime] = useState(new Date());

    // Update clock every second
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Calculate session duration
    const getSessionDuration = () => {
        const totalSeconds = Math.floor((totalTimeSpent || 0) * 60);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    // Speed indicator color
    const speedColor = cardPerMinute < 5 ? '#ef4444' : '#22c55e';
    const speedArrow = cardPerMinute < 5 ? '↓' : cardPerMinute > 5 ? '↑' : '';

    return (
        <div className="queue-stats-bar">
            <div className="stat-item">
                <span className="stat-label">🕐 Clock</span>
                <span className="stat-value">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
            </div>
            <div className="stat-item">
                <span className="stat-label">⏱️ Session</span>
                <span className="stat-value">{getSessionDuration()}</span>
            </div>
            <div className="stat-item">
                <span className="stat-label">⚡ Speed</span>
                <span className="stat-value" style={{ color: speedColor }}>
                    {cardPerMinute} c/m {speedArrow}
                </span>
            </div>
            <div className="stat-item">
                <span className="stat-label">📊 Score</span>
                <span className="stat-value">
                    <span style={{ color: '#22c55e' }}>{totalCardsCompleted - totalAgainCount}</span>
                    <span style={{ color: '#6b7280' }}>/</span>
                    <span style={{ color: '#ef4444' }}>{totalAgainCount}</span>
                </span>
            </div>
            <div className="stat-item">
                <span className="stat-label">🎯 ETA</span>
                <span className="stat-value">
                    {expectedCompletionTime || remainingTime}
                </span>
            </div>
        </div>
    );
}

renderWidget(QueueStatsWidget);
