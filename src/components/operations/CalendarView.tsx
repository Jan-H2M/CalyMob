import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { Operation } from '@/types';
import { SourceBadge } from '../evenements/SourceBadge';
import { formatDate, cn } from '@/utils/utils';

interface CalendarViewProps {
    events: Operation[];
    onEventClick: (event: Operation) => void;
}

export function CalendarView({ events, onEventClick }: CalendarViewProps) {
    const [currentDate, setCurrentDate] = useState(new Date());

    // Get current month/year
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    // Navigation handlers
    const goToPreviousMonth = () => {
        setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
    };

    const goToNextMonth = () => {
        setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
    };

    const goToToday = () => {
        setCurrentDate(new Date());
    };

    // Get days in month
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

    // Adjust for Monday start (0 = Monday, 6 = Sunday)
    const firstDayAdjusted = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

    // Generate calendar days
    const calendarDays = useMemo(() => {
        const days = [];

        // Previous month days
        const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();
        for (let i = firstDayAdjusted - 1; i >= 0; i--) {
            days.push({
                date: new Date(currentYear, currentMonth - 1, prevMonthDays - i),
                isCurrentMonth: false,
            });
        }

        // Current month days
        for (let i = 1; i <= daysInMonth; i++) {
            days.push({
                date: new Date(currentYear, currentMonth, i),
                isCurrentMonth: true,
            });
        }

        // Next month days to fill the grid
        const remainingDays = 42 - days.length; // 6 rows * 7 days
        for (let i = 1; i <= remainingDays; i++) {
            days.push({
                date: new Date(currentYear, currentMonth + 1, i),
                isCurrentMonth: false,
            });
        }

        return days;
    }, [currentYear, currentMonth, daysInMonth, firstDayAdjusted]);

    // Memoize events by date to avoid recalculating for each cell
    const eventsByDate = useMemo(() => {
        const map = new Map<string, Operation[]>();

        events.forEach(event => {
            if (!event.date_debut) return;

            const eventStart = new Date(event.date_debut);
            const eventEnd = event.date_fin ? new Date(event.date_fin) : eventStart;

            // For each day in the event's range, add it to that date's list
            const currentDate = new Date(eventStart);
            while (currentDate <= eventEnd) {
                const dateKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`;
                if (!map.has(dateKey)) {
                    map.set(dateKey, []);
                }
                map.get(dateKey)!.push(event);
                currentDate.setDate(currentDate.getDate() + 1);
            }
        });

        return map;
    }, [events]);

    // Get events for a specific date
    const getEventsForDate = (date: Date) => {
        const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        return eventsByDate.get(dateKey) || [];
    };

    // Check if date is today
    const isToday = (date: Date) => {
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    };

    // Get event type color
    const getEventColor = (type: string) => {
        switch (type) {
            case 'evenement': return 'bg-blue-500 dark:bg-blue-600';
            case 'cotisation': return 'bg-green-500 dark:bg-green-600';
            case 'caution': return 'bg-pink-500 dark:bg-pink-600';
            case 'vente': return 'bg-orange-500 dark:bg-orange-600';
            case 'subvention': return 'bg-yellow-500 dark:bg-yellow-600';
            case 'autre': return 'bg-gray-500 dark:bg-gray-600';
            default: return 'bg-blue-500 dark:bg-blue-600';
        }
    };

    const monthNames = [
        'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];

    const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

    return (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 dark:border-dark-border">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">
                        {monthNames[currentMonth]} {currentYear}
                    </h2>

                    <div className="flex items-center gap-2">
                        {/* Date Picker for quick navigation */}
                        <input
                            type="month"
                            value={`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`}
                            onChange={(e) => {
                                const [year, month] = e.target.value.split('-');
                                setCurrentDate(new Date(parseInt(year), parseInt(month) - 1, 1));
                            }}
                            className="px-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg focus:ring-1 focus:ring-blue-500 bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary"
                        />

                        <button
                            onClick={goToToday}
                            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Aujourd'hui
                        </button>

                        <button
                            onClick={goToPreviousMonth}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
                            title="Mois précédent"
                        >
                            <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-dark-text-secondary" />
                        </button>

                        <button
                            onClick={goToNextMonth}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
                            title="Mois suivant"
                        >
                            <ChevronRight className="h-5 w-5 text-gray-600 dark:text-dark-text-secondary" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="p-4">
                {/* Day names */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                    {dayNames.map(day => (
                        <div
                            key={day}
                            className="text-center text-xs font-semibold text-gray-600 dark:text-dark-text-secondary py-2"
                        >
                            {day}
                        </div>
                    ))}
                </div>

                {/* Calendar days */}
                <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((day, index) => {
                        const dayEvents = getEventsForDate(day.date);
                        const isTodayDate = isToday(day.date);

                        return (
                            <div
                                key={index}
                                className={cn(
                                    "min-h-[100px] border border-gray-200 dark:border-dark-border rounded-lg p-2",
                                    !day.isCurrentMonth && "bg-gray-50 dark:bg-dark-bg-tertiary opacity-50",
                                    isTodayDate && "ring-2 ring-blue-500 dark:ring-blue-400"
                                )}
                            >
                                {/* Date number */}
                                <div className={cn(
                                    "text-sm font-medium mb-1",
                                    day.isCurrentMonth
                                        ? "text-gray-900 dark:text-dark-text-primary"
                                        : "text-gray-400 dark:text-dark-text-muted",
                                    isTodayDate && "bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center"
                                )}>
                                    {day.date.getDate()}
                                </div>

                                {/* Events */}
                                <div className="space-y-1">
                                    {dayEvents.slice(0, 3).map(event => (
                                        <button
                                            key={event.id}
                                            onClick={() => onEventClick(event)}
                                            className={cn(
                                                "w-full text-left px-1.5 py-0.5 rounded text-xs text-white truncate hover:opacity-80 transition-opacity",
                                                getEventColor(event.type || 'evenement')
                                            )}
                                            title={event.titre}
                                        >
                                            {event.titre}
                                        </button>
                                    ))}

                                    {dayEvents.length > 3 && (
                                        <div className="text-xs text-gray-500 dark:text-dark-text-muted pl-1.5">
                                            +{dayEvents.length - 3} autre{dayEvents.length - 3 > 1 ? 's' : ''}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
