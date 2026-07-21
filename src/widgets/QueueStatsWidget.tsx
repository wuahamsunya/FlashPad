import { AppEvents, renderWidget, useAPIEventListener, usePlugin, useSessionStorageState } from '@remnote/plugin-sdk';
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
    const [isEnabled, setIsEnabled] = useState(true);
    // In-review visibility toggle: collapse the card to a small pill without
    // opening settings. Persisted so it survives sessions.
    const [isExpanded, setIsExpanded] = useState(true);

    // Resolve the feature toggle (auto-enabled on iOS/iPadOS)
    const checkEnabled = async () => {
        const ua = navigator.userAgent;
        const platform = navigator.platform;
        const isMobile = /iPad|iPhone/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        if (isMobile) {
            setIsEnabled(true);
        } else {
            const enabled = await plugin.storage.getSynced('queueStatsEnabled');
            setIsEnabled(enabled !== false);
        }
    };

    useEffect(() => {
        checkEnabled();
        plugin.storage.getSynced('queueStatsExpanded').then((expanded) => {
            setIsExpanded(expanded !== false);
        });
    }, [plugin]);

    // React instantly when the toggle changes in the settings popup
    useAPIEventListener(AppEvents.MessageBroadcast, undefined, async (message: any) => {
        if (message?.message?.type === 'featureTogglesUpdated') {
            checkEnabled();
        }
    });

    if (!isEnabled) {
        return null;
    }

    const toggleExpanded = async () => {
        const next = !isExpanded;
        setIsExpanded(next);
        await plugin.storage.setSynced('queueStatsExpanded', next);
    };

    // Collapsed: just a small pill to bring the stats back
    if (!isExpanded) {
        return (
            <button className="qs-fab" onClick={toggleExpanded} title="Show session stats">
                📊
            </button>
        );
    }

    const getSessionDuration = () => {
        const totalSeconds = Math.floor((totalTimeSpent || 0) * 60);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const mmss = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        return hours > 0 ? `${hours}:${mmss}` : mmss;
    };

    const successCount = totalCardsCompleted - totalAgainCount;
    const accuracy = totalCardsCompleted > 0
        ? Math.round((successCount / totalCardsCompleted) * 100)
        : null;
    const speedColor = cardPerMinute < 5 ? '#f87171' : '#34d399';
    const speedArrow = cardPerMinute < 5 ? '↓' : cardPerMinute > 5 ? '↑' : '';

    // Slim single-row bar: same height as the collapsed pill so the queue
    // toolbar never grows when stats are shown
    return (
        <div className="qs-bar">
            <label className="qs-switch" title="Hide stats during review">
                <input type="checkbox" checked={isExpanded} onChange={toggleExpanded} />
                <span className="qs-switch-slider"></span>
            </label>
            <span className="qs-sep" />
            <span className="qs-item" title="Session duration">⏱️{getSessionDuration()}</span>
            <span className="qs-sep" />
            <span className="qs-item" title="Cards per minute" style={{ color: speedColor }}>
                ⚡{cardPerMinute}{speedArrow}
            </span>
            <span className="qs-sep" />
            <span className="qs-item" title="Cards done · correct/again · accuracy">
                📊{totalCardsCompleted}
                <span className="qs-muted">·</span>
                <span style={{ color: '#34d399' }}>{successCount}✓</span>
                <span className="qs-muted">/</span>
                <span style={{ color: '#f87171' }}>{totalAgainCount}✗</span>
                {accuracy !== null && <span className="qs-muted">·{accuracy}%</span>}
            </span>
            <span className="qs-sep" />
            <span className="qs-item" title="Estimated finish">🎯{(expectedCompletionTime || remainingTime).replace(' ', '')}</span>
        </div>
    );
}

renderWidget(QueueStatsWidget);
