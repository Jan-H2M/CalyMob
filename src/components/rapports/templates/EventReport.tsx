import React from 'react';
import { EventStatistics } from '@/types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { Calendar, Users, TrendingUp, Award, CheckCircle } from 'lucide-react';

interface EventReportProps {
  data: EventStatistics;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export function EventReport({ data }: EventReportProps) {
  // Préparer les données pour le graphique des événements par statut
  const statusData = Object.entries(data.events_by_status).map(([status, count]) => {
    const statusLabels: Record<string, string> = {
      'brouillon': 'Brouillon',
      'ouvert': 'Ouvert',
      'ferme': 'Fermé',
      'annule': 'Annulé'
    };
    return {
      name: statusLabels[status] || status,
      value: count
    };
  });

  // Calcul des statistiques clés
  const eventsWithParticipants = data.events.filter(event => {
    const count = data.registrations.filter(r => r.evenement_id === event.id).length;
    return count > 0;
  }).length;

  const occupancyRate = data.events.length > 0 ? (eventsWithParticipants / data.events.length) * 100 : 0;

  return (
    <div className="space-y-8">
      {/* En-tête */}
      <div className="text-center border-b pb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary mb-2">
          Rapport d'Événements
        </h1>
        <p className="text-lg text-gray-600 dark:text-dark-text-secondary">
          {data.period.label}
        </p>
        <p className="text-sm text-gray-500 dark:text-dark-text-muted">
          Du {format(data.period.start_date, 'dd MMMM yyyy', { locale: fr })} au{' '}
          {format(data.period.end_date, 'dd MMMM yyyy', { locale: fr })}
        </p>
      </div>

      {/* Résumé Exécutif */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg">
        <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-blue-600" />
          Résumé Exécutif
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-dark-bg-secondary p-4 rounded-lg shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Événements</p>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">{data.total_events}</p>
          </div>
          <div className="bg-white dark:bg-dark-bg-secondary p-4 rounded-lg shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-green-600" />
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Inscriptions</p>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">{data.total_registrations}</p>
          </div>
          <div className="bg-white dark:bg-dark-bg-secondary p-4 rounded-lg shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Moyenne/Événement</p>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
              {data.average_registrations_per_event.toFixed(1)}
            </p>
          </div>
          <div className="bg-white dark:bg-dark-bg-secondary p-4 rounded-lg shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Taux Paiement</p>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
              {data.payment_rate.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* Évolution Mensuelle */}
      <div className="bg-white dark:bg-dark-bg-secondary p-6 rounded-lg shadow-sm border">
        <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary mb-4">
          Évolution Mensuelle
        </h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.monthly_data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="event_count" fill="#3b82f6" name="Événements" />
              <Bar dataKey="registration_count" fill="#10b981" name="Inscriptions" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tendance des Inscriptions */}
      <div className="bg-white dark:bg-dark-bg-secondary p-6 rounded-lg shadow-sm border">
        <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary mb-4">
          Tendance des Inscriptions
        </h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.monthly_data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="registration_count"
                stroke="#3b82f6"
                strokeWidth={2}
                name="Inscriptions"
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Répartition par Statut */}
      {statusData.length > 0 && (
        <div className="bg-white dark:bg-dark-bg-secondary p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary mb-4">
            Répartition des Événements par Statut
          </h2>
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="h-80 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1">
              <div className="space-y-2">
                {statusData.map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="font-medium text-gray-900 dark:text-dark-text-primary">{item.name}</span>
                    </div>
                    <span className="text-gray-600 dark:text-dark-text-secondary">{item.value} événements</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top 10 Participants */}
      {data.top_participants.length > 0 && (
        <div className="bg-white dark:bg-dark-bg-secondary p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
            <Award className="w-6 h-6 text-yellow-500" />
            Top 10 des Participants les Plus Actifs
          </h2>
          <div className="space-y-3">
            {data.top_participants.map((participant, index) => (
              <div
                key={participant.membre_id}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-dark-text-primary">{participant.membre_nom}</p>
                    <p className="text-sm text-gray-500 dark:text-dark-text-muted">
                      {participant.registration_count} inscription{participant.registration_count > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${participant.percentage}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary w-12 text-right">
                    {participant.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Statistiques Détaillées */}
      <div className="bg-white dark:bg-dark-bg-secondary p-6 rounded-lg shadow-sm border">
        <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary mb-4">
          Statistiques Détaillées
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-700 dark:text-dark-text-primary mb-2">Activité</h3>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600 dark:text-dark-text-secondary">Total événements</span>
              <span className="font-semibold text-gray-900 dark:text-dark-text-primary">{data.total_events}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600 dark:text-dark-text-secondary">Événements avec participants</span>
              <span className="font-semibold text-gray-900 dark:text-dark-text-primary">{eventsWithParticipants}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600 dark:text-dark-text-secondary">Taux d'occupation</span>
              <span className="font-semibold text-gray-900 dark:text-dark-text-primary">{occupancyRate.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600 dark:text-dark-text-secondary">Total inscriptions</span>
              <span className="font-semibold text-gray-900 dark:text-dark-text-primary">{data.total_registrations}</span>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-gray-700 dark:text-dark-text-primary mb-2">Paiements</h3>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600 dark:text-dark-text-secondary">Inscriptions payées</span>
              <span className="font-semibold text-gray-900 dark:text-dark-text-primary">
                {data.registrations.filter(r => r.paye).length}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600 dark:text-dark-text-secondary">En attente de paiement</span>
              <span className="font-semibold text-gray-900 dark:text-dark-text-primary">
                {data.registrations.filter(r => !r.paye).length}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600 dark:text-dark-text-secondary">Taux de paiement</span>
              <span className="font-semibold text-green-600">{data.payment_rate.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600 dark:text-dark-text-secondary">Moyenne par événement</span>
              <span className="font-semibold text-gray-900 dark:text-dark-text-primary">
                {data.average_registrations_per_event.toFixed(1)} inscrits
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Liste des Événements */}
      <div className="bg-white dark:bg-dark-bg-secondary p-6 rounded-lg shadow-sm border">
        <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary mb-4">
          Liste des Événements
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 dark:bg-dark-bg-tertiary">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                  Titre
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                  Inscrits
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                  Payés
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dark-bg-secondary divide-y divide-gray-200">
              {data.events.map(event => {
                const eventRegs = data.registrations.filter(r => r.evenement_id === event.id);
                const paidRegs = eventRegs.filter(r => r.paye).length;

                const statusColors: Record<string, string> = {
                  'brouillon': 'bg-gray-100 text-gray-800',
                  'ouvert': 'bg-green-100 text-green-800',
                  'ferme': 'bg-blue-100 text-blue-800',
                  'annule': 'bg-red-100 text-red-800'
                };

                const statusLabels: Record<string, string> = {
                  'brouillon': 'Brouillon',
                  'ouvert': 'Ouvert',
                  'ferme': 'Fermé',
                  'annule': 'Annulé'
                };

                return (
                  <tr key={event.id} className="hover:bg-gray-50 dark:bg-dark-bg-tertiary">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-dark-text-primary">
                      {format(event.date_debut, 'dd/MM/yyyy', { locale: fr })}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-dark-text-primary">
                      {event.titre}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[event.statut]}`}>
                        {statusLabels[event.statut] || event.statut}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-dark-text-primary text-center">
                      {eventRegs.length}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                      <span className="text-gray-900 dark:text-dark-text-primary">{paidRegs}</span>
                      <span className="text-gray-500 dark:text-dark-text-muted"> / {eventRegs.length}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pied de page */}
      <div className="text-center text-sm text-gray-500 dark:text-dark-text-muted border-t pt-4">
        <p>Rapport généré le {format(new Date(), 'dd MMMM yyyy à HH:mm', { locale: fr })}</p>
        <p className="mt-1">Calypso Diving Club - Système de Comptabilité</p>
      </div>
    </div>
  );
}
