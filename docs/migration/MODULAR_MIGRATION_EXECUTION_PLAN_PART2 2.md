# Plan d'Exécution - Partie 2 : Interface et Migration

## PHASE 3 : INTERFACE D'ADMINISTRATION (4 jours)

### 📱 Phase 3.1 : Composant Principal ModuleManager

#### Étape 3.1.1 : Créer le composant ModuleManager
**Fichier** : `src/components/admin/ModuleManager.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import {
  Package,
  Settings,
  Shield,
  BarChart,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Download,
  Upload,
  RefreshCw,
  Power,
  Trash2
} from 'lucide-react';
import { moduleService } from '@/services/core/moduleService';
import type { ModuleDefinition, ModuleInstance } from '@/types/module.types';

export const ModuleManager: React.FC = () => {
  const [modules, setModules] = useState<ModuleDefinition[]>([]);
  const [installedModules, setInstalledModules] = useState<ModuleInstance[]>([]);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'settings' | 'permissions' | 'data'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadModules();
  }, []);

  const loadModules = async () => {
    try {
      setLoading(true);
      const allModules = await moduleService.getAllModules();
      const installed = moduleService.getInstalledModules();

      setModules(allModules);
      setInstalledModules(installed);
      setError(null);
    } catch (err) {
      setError('Erreur lors du chargement des modules');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInstallModule = async (moduleId: string) => {
    try {
      await moduleService.installModule(clubId, moduleId);
      await loadModules();
      showNotification('Module installé avec succès', 'success');
    } catch (err) {
      showNotification(`Erreur: ${err.message}`, 'error');
    }
  };

  const handleUninstallModule = async (moduleId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir désinstaller ce module ?')) return;

    try {
      await moduleService.uninstallModule(clubId, moduleId);
      await loadModules();
      showNotification('Module désinstallé', 'success');
    } catch (err) {
      showNotification(`Erreur: ${err.message}`, 'error');
    }
  };

  const handleToggleModule = async (moduleId: string, enable: boolean) => {
    try {
      if (enable) {
        await moduleService.enableModule(clubId, moduleId);
      } else {
        await moduleService.disableModule(clubId, moduleId);
      }
      await loadModules();
      showNotification(`Module ${enable ? 'activé' : 'désactivé'}`, 'success');
    } catch (err) {
      showNotification(`Erreur: ${err.message}`, 'error');
    }
  };

  const getModuleStatus = (moduleId: string) => {
    const installed = installedModules.find(m => m.moduleId === moduleId);
    if (!installed) return 'not-installed';
    return installed.isActive ? 'active' : 'inactive';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'inactive':
        return <XCircle className="w-5 h-5 text-gray-400" />;
      default:
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    }
  };

  const getCategoryColor = (category: string) => {
    const colors = {
      core: 'bg-purple-100 text-purple-800',
      finance: 'bg-blue-100 text-blue-800',
      operations: 'bg-green-100 text-green-800',
      communication: 'bg-yellow-100 text-yellow-800',
      admin: 'bg-red-100 text-red-800',
      extension: 'bg-gray-100 text-gray-800'
    };
    return colors[category] || colors.extension;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Package className="mr-3" />
          Gestionnaire de Modules
        </h1>
        <p className="text-gray-600 mt-2">
          Gérez les modules et fonctionnalités de votre application
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Module List */}
        <div className="col-span-4">
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b">
              <h2 className="font-semibold text-gray-900">Modules Disponibles</h2>
            </div>

            <div className="divide-y">
              {modules.map((module) => {
                const status = getModuleStatus(module.id);
                const isSelected = selectedModule === module.id;

                return (
                  <div
                    key={module.id}
                    className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                      isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                    }`}
                    onClick={() => setSelectedModule(module.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center">
                          <h3 className="font-medium text-gray-900">
                            {module.name}
                          </h3>
                          {module.isCore && (
                            <span className="ml-2 px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded">
                              Core
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {module.description}
                        </p>
                        <div className="flex items-center mt-2 space-x-2">
                          <span className={`px-2 py-1 text-xs rounded ${getCategoryColor(module.category)}`}>
                            {module.category}
                          </span>
                          <span className="text-xs text-gray-500">
                            v{module.version}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        {getStatusIcon(status)}
                      </div>
                    </div>

                    {/* Quick Actions */}
                    {status !== 'not-installed' && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleModule(module.id, status === 'inactive');
                          }}
                          className={`px-3 py-1 text-xs rounded ${
                            status === 'active'
                              ? 'bg-gray-200 hover:bg-gray-300'
                              : 'bg-blue-500 text-white hover:bg-blue-600'
                          }`}
                        >
                          <Power className="w-3 h-3 inline mr-1" />
                          {status === 'active' ? 'Désactiver' : 'Activer'}
                        </button>

                        {!module.isCore && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUninstallModule(module.id);
                            }}
                            className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                          >
                            <Trash2 className="w-3 h-3 inline mr-1" />
                            Désinstaller
                          </button>
                        )}
                      </div>
                    )}

                    {status === 'not-installed' && !module.isCore && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInstallModule(module.id);
                        }}
                        className="mt-3 w-full px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                      >
                        <Download className="w-3 h-3 inline mr-1" />
                        Installer
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Module Details */}
        <div className="col-span-8">
          {selectedModule ? (
            <ModuleDetails
              moduleId={selectedModule}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          ) : (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                Sélectionnez un module
              </h3>
              <p className="text-gray-600 mt-2">
                Choisissez un module dans la liste pour voir ses détails et paramètres
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
```

#### Étape 3.1.2 : Créer le composant ModuleDetails
**Fichier** : `src/components/admin/ModuleDetails.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  Database,
  Info,
  Save,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  ChevronRight
} from 'lucide-react';
import { moduleService } from '@/services/core/moduleService';
import { ModuleSettings } from './ModuleSettings';
import { ModulePermissions } from './ModulePermissions';
import { ModuleData } from './ModuleData';
import type { ModuleDefinition, ModuleInstance } from '@/types/module.types';

interface ModuleDetailsProps {
  moduleId: string;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const ModuleDetails: React.FC<ModuleDetailsProps> = ({
  moduleId,
  activeTab,
  onTabChange
}) => {
  const [module, setModule] = useState<ModuleDefinition | null>(null);
  const [instance, setInstance] = useState<ModuleInstance | null>(null);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadModuleDetails();
  }, [moduleId]);

  const loadModuleDetails = async () => {
    try {
      const moduleData = moduleService.getModule(moduleId);
      const instanceData = moduleService.getModuleInstance(moduleId);

      setModule(moduleData);
      setInstance(instanceData);

      if (instanceData) {
        setSettings(instanceData.settings || {});
        setPermissions(instanceData.permissions || {});
      }
    } catch (err) {
      console.error('Error loading module details:', err);
    }
  };

  const handleSettingsChange = (newSettings: Record<string, any>) => {
    setSettings(newSettings);
    setHasChanges(true);
  };

  const handlePermissionsChange = (newPermissions: Record<string, string[]>) => {
    setPermissions(newPermissions);
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!module || !instance) return;

    try {
      setSaving(true);

      if (activeTab === 'settings') {
        await moduleService.updateModuleSettings(clubId, moduleId, settings);
      } else if (activeTab === 'permissions') {
        await moduleService.updateModulePermissions(clubId, moduleId, permissions);
      }

      setHasChanges(false);
      showNotification('Modifications enregistrées', 'success');
    } catch (err) {
      showNotification(`Erreur: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!instance) return;

    setSettings(instance.settings || {});
    setPermissions(instance.permissions || {});
    setHasChanges(false);
  };

  if (!module) {
    return (
      <div className="bg-white rounded-lg shadow p-12 text-center">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
        <p className="text-gray-600 mt-4">Chargement...</p>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Vue d\'ensemble', icon: Info },
    { id: 'settings', label: 'Paramètres', icon: Settings },
    { id: 'permissions', label: 'Permissions', icon: Shield },
    { id: 'data', label: 'Données', icon: Database }
  ];

  const isInstalled = !!instance;
  const isActive = instance?.isActive || false;

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Module Header */}
      <div className="p-6 border-b">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {module.name}
            </h2>
            <p className="text-gray-600 mt-1">
              {module.description}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {isInstalled && (
              <span className={`px-3 py-1 rounded text-sm ${
                isActive
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {isActive ? 'Actif' : 'Inactif'}
              </span>
            )}
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded text-sm">
              v{module.version}
            </span>
          </div>
        </div>

        {/* Dependencies Alert */}
        {module.dependencies && module.dependencies.length > 0 && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <div className="flex items-start">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-yellow-800">
                  Dépendances requises
                </p>
                <p className="text-sm text-yellow-700 mt-1">
                  Ce module nécessite : {module.dependencies.join(', ')}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      {isInstalled && (
        <>
          <div className="border-b">
            <nav className="flex space-x-8 px-6" aria-label="Tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`
                      py-4 px-1 border-b-2 font-medium text-sm flex items-center
                      ${activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'overview' && (
              <ModuleOverview module={module} instance={instance} />
            )}

            {activeTab === 'settings' && (
              <ModuleSettings
                module={module}
                settings={settings}
                onChange={handleSettingsChange}
              />
            )}

            {activeTab === 'permissions' && (
              <ModulePermissions
                module={module}
                permissions={permissions}
                onChange={handlePermissionsChange}
              />
            )}

            {activeTab === 'data' && (
              <ModuleData
                moduleId={moduleId}
                instance={instance}
              />
            )}
          </div>

          {/* Action Bar */}
          {(activeTab === 'settings' || activeTab === 'permissions') && hasChanges && (
            <div className="px-6 py-4 bg-gray-50 border-t flex justify-between items-center">
              <p className="text-sm text-gray-600">
                Vous avez des modifications non enregistrées
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                  disabled={saving}
                >
                  Annuler
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 flex items-center"
                  disabled={saving}
                >
                  {saving ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Enregistrer
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Not Installed Message */}
      {!isInstalled && (
        <div className="p-12 text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">
            Module non installé
          </h3>
          <p className="text-gray-600 mt-2">
            Ce module doit être installé pour accéder à ses paramètres
          </p>
        </div>
      )}
    </div>
  );
};
```

### 📊 Phase 3.2 : Composants de Configuration

#### Étape 3.2.1 : Composant ModuleSettings
**Fichier** : `src/components/admin/ModuleSettings.tsx`

```typescript
import React from 'react';
import { Info, HelpCircle } from 'lucide-react';
import type { ModuleDefinition, SettingDefinition } from '@/types/module.types';

interface ModuleSettingsProps {
  module: ModuleDefinition;
  settings: Record<string, any>;
  onChange: (settings: Record<string, any>) => void;
}

export const ModuleSettings: React.FC<ModuleSettingsProps> = ({
  module,
  settings,
  onChange
}) => {
  const handleSettingChange = (key: string, value: any) => {
    onChange({
      ...settings,
      [key]: value
    });
  };

  const renderSetting = (setting: SettingDefinition) => {
    const value = settings[setting.key] ?? setting.defaultValue;

    // Check if setting depends on another setting
    if (setting.dependsOn) {
      const [depKey, depValue] = setting.dependsOn.split('=');
      const currentDepValue = settings[depKey];

      if (depValue) {
        if (currentDepValue !== depValue) return null;
      } else {
        if (!currentDepValue) return null;
      }
    }

    switch (setting.type) {
      case 'boolean':
        return (
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => handleSettingChange(setting.key, e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-700">{setting.label}</span>
          </label>
        );

      case 'number':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {setting.label}
            </label>
            <input
              type="number"
              value={value}
              onChange={(e) => handleSettingChange(setting.key, Number(e.target.value))}
              min={setting.validation?.min}
              max={setting.validation?.max}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        );

      case 'string':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {setting.label}
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => handleSettingChange(setting.key, e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        );

      case 'select':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {setting.label}
            </label>
            <select
              value={value}
              onChange={(e) => handleSettingChange(setting.key, e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              {setting.options?.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        );

      case 'multiselect':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {setting.label}
            </label>
            <div className="space-y-2">
              {setting.options?.map(option => (
                <label key={option.value} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={value?.includes(option.value)}
                    onChange={(e) => {
                      const newValue = e.target.checked
                        ? [...(value || []), option.value]
                        : (value || []).filter(v => v !== option.value);
                      handleSettingChange(setting.key, newValue);
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">{option.label}</span>
                </label>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const groupedSettings = {};

  if (module.settings) {
    Object.entries(module.settings).forEach(([category, categorySettings]) => {
      groupedSettings[category] = Object.values(categorySettings);
    });
  }

  return (
    <div className="space-y-8">
      {Object.entries(groupedSettings).map(([category, categorySettings]) => (
        <div key={category} className="bg-gray-50 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4 capitalize">
            {category.replace(/_/g, ' ')}
          </h3>

          <div className="space-y-4">
            {categorySettings.map((setting: SettingDefinition) => {
              const rendered = renderSetting(setting);
              if (!rendered) return null;

              return (
                <div key={setting.key} className="relative">
                  {rendered}

                  {setting.description && (
                    <p className="mt-1 text-xs text-gray-500 flex items-start">
                      <Info className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
                      {setting.description}
                    </p>
                  )}

                  {setting.advanced && (
                    <span className="absolute -left-2 top-0 w-1 h-full bg-yellow-400 rounded"></span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {Object.keys(groupedSettings).length === 0 && (
        <div className="text-center py-8">
          <Info className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">
            Ce module n'a pas de paramètres configurables
          </p>
        </div>
      )}
    </div>
  );
};
```

#### Étape 3.2.2 : Composant ModulePermissions
**Fichier** : `src/components/admin/ModulePermissions.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { Shield, Users, Lock, Unlock, AlertCircle } from 'lucide-react';
import { moduleService } from '@/services/core/moduleService';
import type { ModuleDefinition, ModularRole } from '@/types/module.types';

interface ModulePermissionsProps {
  module: ModuleDefinition;
  permissions: Record<string, string[]>;
  onChange: (permissions: Record<string, string[]>) => void;
}

export const ModulePermissions: React.FC<ModulePermissionsProps> = ({
  module,
  permissions,
  onChange
}) => {
  const [roles, setRoles] = useState<ModularRole[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    const allRoles = moduleService.getAllRoles();
    setRoles(allRoles);
    if (allRoles.length > 0 && !selectedRole) {
      setSelectedRole(allRoles[0].id);
    }
  };

  const handlePermissionToggle = (roleId: string, permissionId: string) => {
    const rolePermissions = permissions[roleId] || [];
    const hasPermission = rolePermissions.includes(permissionId);

    const newPermissions = hasPermission
      ? rolePermissions.filter(p => p !== permissionId)
      : [...rolePermissions, permissionId];

    onChange({
      ...permissions,
      [roleId]: newPermissions
    });
  };

  const getRiskColor = (riskLevel: string) => {
    const colors = {
      low: 'text-green-600',
      medium: 'text-yellow-600',
      high: 'text-orange-600',
      critical: 'text-red-600'
    };
    return colors[riskLevel] || 'text-gray-600';
  };

  const getCategoryIcon = (category: string) => {
    const icons = {
      view: '👁',
      create: '➕',
      update: '✏️',
      delete: '🗑',
      manage: '⚙️',
      admin: '👑'
    };
    return icons[category] || '📋';
  };

  const groupedPermissions = {};

  if (module.permissions) {
    Object.entries(module.permissions).forEach(([category, perms]) => {
      groupedPermissions[category] = perms;
    });
  }

  return (
    <div className="space-y-6">
      {/* Role Selector */}
      <div className="bg-white rounded-lg border p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Configurer les permissions pour le rôle :
        </label>
        <select
          value={selectedRole || ''}
          onChange={(e) => setSelectedRole(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        >
          {roles.map(role => (
            <option key={role.id} value={role.id}>
              {role.name} {role.isSystem && '(Système)'}
            </option>
          ))}
        </select>
      </div>

      {/* Permission Matrix */}
      {selectedRole && (
        <div className="bg-white rounded-lg border">
          <div className="p-4 bg-gray-50 border-b">
            <h3 className="font-medium text-gray-900 flex items-center">
              <Shield className="w-5 h-5 mr-2" />
              Permissions pour : {roles.find(r => r.id === selectedRole)?.name}
            </h3>
          </div>

          <div className="p-4 space-y-6">
            {Object.entries(groupedPermissions).map(([category, categoryPermissions]) => (
              <div key={category} className="space-y-3">
                <h4 className="text-sm font-medium text-gray-700 uppercase tracking-wider">
                  {category}
                </h4>

                <div className="grid grid-cols-1 gap-3">
                  {categoryPermissions.map((permission) => {
                    const rolePermissions = permissions[selectedRole] || [];
                    const hasPermission = rolePermissions.includes(permission.id);
                    const isSystemRole = roles.find(r => r.id === selectedRole)?.isSystem;

                    return (
                      <div
                        key={permission.id}
                        className="flex items-start p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={hasPermission}
                          onChange={() => handlePermissionToggle(selectedRole, permission.id)}
                          disabled={isSystemRole && selectedRole === 'superadmin'}
                          className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />

                        <div className="ml-3 flex-1">
                          <div className="flex items-center">
                            <span className="text-sm font-medium text-gray-900">
                              {getCategoryIcon(permission.category)} {permission.label}
                            </span>
                            <span className={`ml-2 text-xs ${getRiskColor(permission.riskLevel)}`}>
                              {permission.riskLevel}
                            </span>
                          </div>

                          <p className="text-xs text-gray-600 mt-1">
                            {permission.description}
                          </p>

                          {permission.requiresCondition && (
                            <p className="text-xs text-yellow-600 mt-1 flex items-center">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Condition: {permission.requiresCondition}
                            </p>
                          )}

                          {permission.impliedPermissions && (
                            <p className="text-xs text-blue-600 mt-1">
                              Inclut: {permission.impliedPermissions.join(', ')}
                            </p>
                          )}
                        </div>

                        <div className="ml-3">
                          {hasPermission ? (
                            <Unlock className="w-5 h-5 text-green-500" />
                          ) : (
                            <Lock className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex justify-end space-x-3">
        <button
          onClick={() => {
            if (!selectedRole) return;
            onChange({
              ...permissions,
              [selectedRole]: []
            });
          }}
          className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
        >
          Tout retirer
        </button>

        <button
          onClick={() => {
            if (!selectedRole || !module.permissions) return;
            const allPerms = [];
            Object.values(module.permissions).forEach(categoryPerms => {
              categoryPerms.forEach(p => allPerms.push(p.id));
            });
            onChange({
              ...permissions,
              [selectedRole]: allPerms
            });
          }}
          className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
        >
          Tout accorder
        </button>
      </div>
    </div>
  );
};
```

---

## PHASE 4 : SECURITY RULES & MIGRATION (3 jours)

### 🔒 Phase 4.1 : Security Rules Dynamiques

#### Étape 4.1.1 : Nouvelles Security Rules
**Fichier** : `firestore.rules`

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ========== Helper Functions ==========

    function isAuthenticated() {
      return request.auth != null;
    }

    function getCurrentUser() {
      return request.auth.uid;
    }

    function getClubMember(clubId) {
      return get(/databases/$(database)/documents/clubs/$(clubId)/members/$(getCurrentUser()));
    }

    function getUserRole(clubId) {
      let member = getClubMember(clubId);
      return member.data.roleId;
    }

    function getRole(clubId, roleId) {
      return get(/databases/$(database)/documents/clubs/$(clubId)/roles/$(roleId));
    }

    function hasModulePermission(clubId, moduleId, permissionId) {
      let roleId = getUserRole(clubId);
      let role = getRole(clubId, roleId);
      let modulePerms = role.data.modulePermissions[moduleId];
      return modulePerms != null && permissionId in modulePerms;
    }

    function isModuleActive(clubId, moduleId) {
      let module = get(/databases/$(database)/documents/clubs/$(clubId)/modules/$(moduleId));
      return module.data.isActive == true;
    }

    function canAccessModule(clubId, moduleId) {
      return isModuleActive(clubId, moduleId);
    }

    // ========== Module Definitions (Global) ==========

    match /module_definitions/{moduleId} {
      allow read: if isAuthenticated();
      allow write: if false; // Only through admin SDK
    }

    // ========== Club-specific Rules ==========

    match /clubs/{clubId} {

      // Module Instances
      match /modules/{moduleId} {
        allow read: if isAuthenticated() &&
                       hasModulePermission(clubId, 'admin', 'view_modules');

        allow create: if hasModulePermission(clubId, 'admin', 'install_modules');

        allow update: if hasModulePermission(clubId, moduleId, 'configure');

        allow delete: if hasModulePermission(clubId, 'admin', 'uninstall_modules');
      }

      // Roles
      match /roles/{roleId} {
        allow read: if isAuthenticated();

        allow write: if hasModulePermission(clubId, 'admin', 'manage_roles');
      }

      // Members
      match /members/{memberId} {
        allow read: if isAuthenticated() &&
                      (memberId == getCurrentUser() ||
                       hasModulePermission(clubId, 'users', 'view'));

        allow update: if memberId == getCurrentUser() &&
                        request.resource.data.diff(resource.data).affectedKeys()
                          .hasOnly(['profile', 'preferences']) ||
                        hasModulePermission(clubId, 'users', 'update');

        allow create: if hasModulePermission(clubId, 'users', 'create');

        allow delete: if hasModulePermission(clubId, 'users', 'delete');
      }

      // Module Data Collections
      match /module_data/{moduleId}/{document=**} {
        allow read: if canAccessModule(clubId, moduleId) &&
                      hasModulePermission(clubId, moduleId, 'view');

        allow create: if canAccessModule(clubId, moduleId) &&
                        hasModulePermission(clubId, moduleId, 'create');

        allow update: if canAccessModule(clubId, moduleId) &&
                        hasModulePermission(clubId, moduleId, 'update');

        allow delete: if canAccessModule(clubId, moduleId) &&
                        hasModulePermission(clubId, moduleId, 'delete');
      }

      // Specific Module Rules

      // Transactions Module
      match /module_data/transactions/items/{transactionId} {
        allow read: if canAccessModule(clubId, 'transactions') &&
                      hasModulePermission(clubId, 'transactions', 'view');

        allow create: if canAccessModule(clubId, 'transactions') &&
                        hasModulePermission(clubId, 'transactions', 'create');

        allow update: if canAccessModule(clubId, 'transactions') &&
                        (hasModulePermission(clubId, 'transactions', 'update') ||
                         (hasModulePermission(clubId, 'transactions', 'categorize') &&
                          request.resource.data.diff(resource.data).affectedKeys()
                            .hasOnly(['category', 'subcategory'])));

        allow delete: if canAccessModule(clubId, 'transactions') &&
                        hasModulePermission(clubId, 'transactions', 'delete');
      }

      // Expenses Module
      match /module_data/expenses/requests/{requestId} {
        allow read: if canAccessModule(clubId, 'expenses') &&
                      (resource.data.requesterId == getCurrentUser() &&
                       hasModulePermission(clubId, 'expenses', 'view_own')) ||
                      hasModulePermission(clubId, 'expenses', 'view_all');

        allow create: if canAccessModule(clubId, 'expenses') &&
                        hasModulePermission(clubId, 'expenses', 'create') &&
                        request.resource.data.requesterId == getCurrentUser();

        allow update: if canAccessModule(clubId, 'expenses') &&
                        ((resource.data.requesterId == getCurrentUser() &&
                          resource.data.status == 'draft' &&
                          hasModulePermission(clubId, 'expenses', 'update_own')) ||
                         hasModulePermission(clubId, 'expenses', 'update_all') ||
                         (hasModulePermission(clubId, 'expenses', 'approve') &&
                          request.resource.data.diff(resource.data).affectedKeys()
                            .hasOnly(['status', 'approvedBy', 'approvedAt', 'comments'])));

        allow delete: if canAccessModule(clubId, 'expenses') &&
                        ((resource.data.requesterId == getCurrentUser() &&
                          resource.data.status == 'draft' &&
                          hasModulePermission(clubId, 'expenses', 'delete_own')) ||
                         hasModulePermission(clubId, 'expenses', 'delete_all'));
      }

      // Inventory Module
      match /module_data/inventory/items/{itemId} {
        allow read: if canAccessModule(clubId, 'inventory') &&
                      hasModulePermission(clubId, 'inventory', 'view');

        allow create: if canAccessModule(clubId, 'inventory') &&
                        hasModulePermission(clubId, 'inventory', 'add_items');

        allow update: if canAccessModule(clubId, 'inventory') &&
                        hasModulePermission(clubId, 'inventory', 'edit_items');

        allow delete: if canAccessModule(clubId, 'inventory') &&
                        hasModulePermission(clubId, 'inventory', 'delete_items');
      }

      match /module_data/inventory/loans/{loanId} {
        allow read: if canAccessModule(clubId, 'inventory') &&
                      (hasModulePermission(clubId, 'inventory', 'view') ||
                       (resource.data.borrowerId == getCurrentUser()));

        allow create: if canAccessModule(clubId, 'inventory') &&
                        hasModulePermission(clubId, 'inventory', 'create_loan');

        allow update: if canAccessModule(clubId, 'inventory') &&
                        (hasModulePermission(clubId, 'inventory', 'return_item') ||
                         (hasModulePermission(clubId, 'inventory', 'approve_loans') &&
                          request.resource.data.diff(resource.data).affectedKeys()
                            .hasOnly(['status', 'approvedBy', 'approvedAt'])));

        allow delete: if false; // Loans should never be deleted, only marked as returned
      }
    }
  }
}
```

### 🔄 Phase 4.2 : Script de Migration Complet

#### Étape 4.2.1 : Service de Migration
**Fichier** : `src/services/migration/moduleMigration.ts`

```typescript
import {
  collection,
  doc,
  writeBatch,
  serverTimestamp,
  getDocs,
  getDoc,
  setDoc
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { CORE_MODULES, OPTIONAL_MODULES } from '@/config/modules/coreModules';
import type { MigrationPlan, MigrationStatus, MigrationLog } from '@/types/migration.types';

export class ModuleMigrationService {
  private status: MigrationStatus;
  private logs: MigrationLog[] = [];

  constructor() {
    this.status = {
      planId: 'modular-migration-v1',
      status: 'pending',
      progress: 0,
      logs: []
    };
  }

  // Main migration method
  async executeMigration(clubId: string): Promise<void> {
    try {
      this.log('info', 'Starting modular migration...');
      this.status.status = 'running';
      this.status.startedAt = new Date();

      // Step 1: Backup existing data
      await this.backupExistingData(clubId);
      this.updateProgress(10);

      // Step 2: Create module definitions
      await this.createModuleDefinitions();
      this.updateProgress(20);

      // Step 3: Migrate existing roles
      await this.migrateRoles(clubId);
      this.updateProgress(30);

      // Step 4: Install core modules
      await this.installCoreModules(clubId);
      this.updateProgress(50);

      // Step 5: Migrate existing settings
      await this.migrateSettings(clubId);
      this.updateProgress(70);

      // Step 6: Migrate existing data
      await this.migrateData(clubId);
      this.updateProgress(90);

      // Step 7: Validate migration
      await this.validateMigration(clubId);
      this.updateProgress(100);

      this.status.status = 'completed';
      this.status.completedAt = new Date();
      this.log('success', 'Migration completed successfully!');

    } catch (error) {
      this.status.status = 'failed';
      this.status.errors = [error.message];
      this.log('error', `Migration failed: ${error.message}`);
      throw error;
    }
  }

  // Step 1: Backup existing data
  private async backupExistingData(clubId: string): Promise<void> {
    this.log('info', 'Creating backup of existing data...');

    const batch = writeBatch(db);
    const backupPath = `clubs/${clubId}/backups/pre-modular-${Date.now()}`;

    // Backup settings
    const settingsRef = collection(db, `clubs/${clubId}/settings`);
    const settingsSnapshot = await getDocs(settingsRef);

    settingsSnapshot.forEach((doc) => {
      batch.set(
        doc(db, `${backupPath}/settings/${doc.id}`),
        doc.data()
      );
    });

    // Backup members
    const membersRef = collection(db, `clubs/${clubId}/members`);
    const membersSnapshot = await getDocs(membersRef);

    membersSnapshot.forEach((doc) => {
      batch.set(
        doc(db, `${backupPath}/members/${doc.id}`),
        doc.data()
      );
    });

    await batch.commit();
    this.log('success', 'Backup created successfully');
  }

  // Step 2: Create module definitions
  private async createModuleDefinitions(): Promise<void> {
    this.log('info', 'Creating module definitions...');

    const batch = writeBatch(db);

    // Create core modules
    for (const module of CORE_MODULES) {
      batch.set(
        doc(db, `module_definitions/${module.id}`),
        {
          ...module,
          createdAt: serverTimestamp()
        }
      );
    }

    // Create optional modules
    for (const module of OPTIONAL_MODULES) {
      batch.set(
        doc(db, `module_definitions/${module.id}`),
        {
          ...module,
          createdAt: serverTimestamp()
        }
      );
    }

    await batch.commit();
    this.log('success', `Created ${CORE_MODULES.length + OPTIONAL_MODULES.length} module definitions`);
  }

  // Step 3: Migrate existing roles to modular roles
  private async migrateRoles(clubId: string): Promise<void> {
    this.log('info', 'Migrating existing roles...');

    const existingRoles = [
      { id: 'superadmin', name: 'Super Administrateur', level: 3 },
      { id: 'admin', name: 'Administrateur', level: 2 },
      { id: 'validateur', name: 'Validateur', level: 1 },
      { id: 'user', name: 'Utilisateur', level: 0 },
      { id: 'membre', name: 'Membre', level: -1 }
    ];

    const batch = writeBatch(db);

    for (const role of existingRoles) {
      const modulePermissions = this.mapLegacyPermissions(role.id);

      batch.set(
        doc(db, `clubs/${clubId}/roles/${role.id}`),
        {
          id: role.id,
          clubId,
          name: role.name,
          description: `Rôle système migré`,
          level: role.level,
          color: this.getRoleColor(role.id),
          icon: this.getRoleIcon(role.id),
          isSystem: true,
          isActive: true,
          modulePermissions,
          canManage: this.getRoleHierarchy(role.id),
          createdAt: serverTimestamp(),
          createdBy: 'system-migration'
        }
      );
    }

    await batch.commit();
    this.log('success', `Migrated ${existingRoles.length} roles`);
  }

  // Step 4: Install core modules for the club
  private async installCoreModules(clubId: string): Promise<void> {
    this.log('info', 'Installing core modules...');

    const batch = writeBatch(db);

    for (const module of CORE_MODULES) {
      batch.set(
        doc(db, `clubs/${clubId}/modules/${module.id}`),
        {
          moduleId: module.id,
          clubId,
          settings: this.extractModuleSettings(module),
          permissions: this.getDefaultModulePermissions(module),
          isActive: true,
          installedAt: serverTimestamp(),
          installedBy: 'system-migration'
        }
      );

      // Create module data structure
      batch.set(
        doc(db, `clubs/${clubId}/module_data/${module.id}/metadata`),
        {
          createdAt: serverTimestamp(),
          version: module.version,
          schemaVersion: 1
        }
      );
    }

    await batch.commit();
    this.log('success', `Installed ${CORE_MODULES.length} core modules`);
  }

  // Step 5: Migrate existing settings to module settings
  private async migrateSettings(clubId: string): Promise<void> {
    this.log('info', 'Migrating existing settings...');

    // Load existing settings
    const generalSettings = await this.loadDocument(`clubs/${clubId}/settings/general`);
    const securitySettings = await this.loadDocument(`clubs/${clubId}/settings/security`);
    const downloadSettings = await this.loadDocument(`clubs/${clubId}/settings/downloads`);
    const communicationSettings = await this.loadDocument(`clubs/${clubId}/settings/communication`);

    const batch = writeBatch(db);

    // Map settings to appropriate modules
    if (downloadSettings) {
      batch.update(
        doc(db, `clubs/${clubId}/modules/transactions`),
        {
          'settings.download': downloadSettings,
          updatedAt: serverTimestamp()
        }
      );
    }

    if (generalSettings) {
      // Map general settings to relevant modules
      if (generalSettings.doubleApprovalThreshold !== undefined) {
        batch.update(
          doc(db, `clubs/${clubId}/modules/expenses`),
          {
            'settings.workflow.autoApproveThreshold': generalSettings.doubleApprovalThreshold,
            updatedAt: serverTimestamp()
          }
        );
      }
    }

    if (communicationSettings) {
      // Communication module will handle these settings
      batch.set(
        doc(db, `clubs/${clubId}/modules/communication`),
        {
          moduleId: 'communication',
          clubId,
          settings: communicationSettings,
          isActive: true,
          installedAt: serverTimestamp(),
          installedBy: 'system-migration'
        }
      );
    }

    await batch.commit();
    this.log('success', 'Settings migrated successfully');
  }

  // Step 6: Migrate existing data to module data structure
  private async migrateData(clubId: string): Promise<void> {
    this.log('info', 'Migrating existing data...');

    // Migrate transactions
    await this.migrateTransactions(clubId);

    // Migrate expenses (demandes)
    await this.migrateExpenses(clubId);

    // Migrate events (operations)
    await this.migrateEvents(clubId);

    this.log('success', 'Data migration completed');
  }

  private async migrateTransactions(clubId: string): Promise<void> {
    const transactionsRef = collection(db, `clubs/${clubId}/transactions_bancaires`);
    const snapshot = await getDocs(transactionsRef);

    if (snapshot.empty) return;

    const batch = writeBatch(db);
    let count = 0;

    snapshot.forEach((doc) => {
      batch.set(
        doc(db, `clubs/${clubId}/module_data/transactions/items/${doc.id}`),
        {
          ...doc.data(),
          migratedAt: serverTimestamp()
        }
      );
      count++;

      if (count % 500 === 0) {
        // Commit batch every 500 documents (Firestore limit)
        await batch.commit();
        batch = writeBatch(db);
      }
    });

    if (count % 500 !== 0) {
      await batch.commit();
    }

    this.log('info', `Migrated ${count} transactions`);
  }

  private async migrateExpenses(clubId: string): Promise<void> {
    const expensesRef = collection(db, `clubs/${clubId}/demandes_remboursement`);
    const snapshot = await getDocs(expensesRef);

    if (snapshot.empty) return;

    const batch = writeBatch(db);
    let count = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      batch.set(
        doc(db, `clubs/${clubId}/module_data/expenses/requests/${doc.id}`),
        {
          ...data,
          requesterId: data.demandeur_id, // Rename field
          migratedAt: serverTimestamp()
        }
      );
      count++;
    });

    await batch.commit();
    this.log('info', `Migrated ${count} expense requests`);
  }

  private async migrateEvents(clubId: string): Promise<void> {
    const eventsRef = collection(db, `clubs/${clubId}/operations`);
    const snapshot = await getDocs(eventsRef);

    if (snapshot.empty) return;

    const batch = writeBatch(db);
    let count = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      batch.set(
        doc(db, `clubs/${clubId}/module_data/events/items/${doc.id}`),
        {
          ...data,
          organizerId: data.organisateur_id, // Rename field
          migratedAt: serverTimestamp()
        }
      );
      count++;
    });

    await batch.commit();
    this.log('info', `Migrated ${count} events`);
  }

  // Step 7: Validate migration
  private async validateMigration(clubId: string): Promise<void> {
    this.log('info', 'Validating migration...');

    const checks = [
      this.checkModulesInstalled(clubId),
      this.checkRolesMigrated(clubId),
      this.checkDataMigrated(clubId)
    ];

    const results = await Promise.all(checks);

    if (results.every(r => r)) {
      this.log('success', 'Migration validation passed');
    } else {
      throw new Error('Migration validation failed');
    }
  }

  // Helper methods
  private mapLegacyPermissions(roleId: string): Record<string, string[]> {
    // Map old permissions to new module-based permissions
    const mappings = {
      superadmin: {
        transactions: ['view', 'create', 'update', 'delete', 'sign', 'reconcile', 'link', 'configure', 'audit'],
        expenses: ['view_all', 'create', 'update_all', 'delete_all', 'approve', 'reject', 'export', 'configure'],
        events: ['view', 'create', 'update_all', 'delete', 'manage_participants', 'send_messages', 'financial_report', 'configure'],
        inventory: ['view', 'search', 'add_items', 'edit_items', 'delete_items', 'create_loan', 'approve_loans', 'manage_cautions', 'configure'],
        admin: ['view_modules', 'install_modules', 'uninstall_modules', 'manage_roles']
      },
      admin: {
        transactions: ['view', 'create', 'update', 'delete', 'sign', 'reconcile', 'link', 'export'],
        expenses: ['view_all', 'create', 'update_all', 'approve', 'reject', 'export'],
        events: ['view', 'create', 'update_all', 'delete', 'manage_participants', 'send_messages'],
        users: ['view', 'create', 'update', 'activate', 'assignRole']
      },
      validateur: {
        transactions: ['view', 'create', 'update', 'categorize', 'sign', 'link', 'export'],
        expenses: ['view_all', 'approve', 'reject', 'comment'],
        events: ['view', 'create', 'update_own', 'manage_participants']
      },
      user: {
        expenses: ['view_own', 'create', 'update_own', 'delete_own'],
        events: ['view', 'register', 'cancel_registration']
      },
      membre: {}
    };

    return mappings[roleId] || {};
  }

  private getRoleColor(roleId: string): string {
    const colors = {
      superadmin: '#7C3AED',  // purple-600
      admin: '#DC2626',       // red-600
      validateur: '#2563EB',  // blue-600
      user: '#10B981',        // green-600
      membre: '#6B7280'       // gray-500
    };
    return colors[roleId] || '#6B7280';
  }

  private getRoleIcon(roleId: string): string {
    const icons = {
      superadmin: 'Crown',
      admin: 'Shield',
      validateur: 'CheckCircle',
      user: 'User',
      membre: 'UserMinus'
    };
    return icons[roleId] || 'User';
  }

  private getRoleHierarchy(roleId: string): string[] {
    const hierarchy = {
      superadmin: ['superadmin', 'admin', 'validateur', 'user', 'membre'],
      admin: ['validateur', 'user', 'membre'],
      validateur: [],
      user: [],
      membre: []
    };
    return hierarchy[roleId] || [];
  }

  private extractModuleSettings(module: any): Record<string, any> {
    const settings = {};

    if (module.settings) {
      Object.values(module.settings).forEach((category) => {
        Object.values(category).forEach((setting: any) => {
          settings[setting.key] = setting.defaultValue;
        });
      });
    }

    return settings;
  }

  private getDefaultModulePermissions(module: any): Record<string, string[]> {
    // Return default permissions for system roles
    return {
      superadmin: this.getAllPermissions(module),
      admin: this.getAdminPermissions(module),
      validateur: this.getValidateurPermissions(module),
      user: this.getUserPermissions(module)
    };
  }

  private getAllPermissions(module: any): string[] {
    const permissions = [];
    if (module.permissions) {
      Object.values(module.permissions).forEach((category: any) => {
        category.forEach((perm: any) => {
          permissions.push(perm.id);
        });
      });
    }
    return permissions;
  }

  private getAdminPermissions(module: any): string[] {
    const permissions = [];
    if (module.permissions) {
      Object.values(module.permissions).forEach((category: any) => {
        category.forEach((perm: any) => {
          if (perm.riskLevel !== 'critical') {
            permissions.push(perm.id);
          }
        });
      });
    }
    return permissions;
  }

  private getValidateurPermissions(module: any): string[] {
    const permissions = [];
    if (module.permissions) {
      Object.values(module.permissions).forEach((category: any) => {
        category.forEach((perm: any) => {
          if (perm.category !== 'admin' && perm.riskLevel !== 'high') {
            permissions.push(perm.id);
          }
        });
      });
    }
    return permissions;
  }

  private getUserPermissions(module: any): string[] {
    const permissions = [];
    if (module.permissions) {
      Object.values(module.permissions).forEach((category: any) => {
        category.forEach((perm: any) => {
          if (perm.category === 'view' || perm.riskLevel === 'low') {
            permissions.push(perm.id);
          }
        });
      });
    }
    return permissions;
  }

  private async loadDocument(path: string): Promise<any> {
    try {
      const docRef = doc(db, path);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch {
      return null;
    }
  }

  private async checkModulesInstalled(clubId: string): Promise<boolean> {
    const modulesRef = collection(db, `clubs/${clubId}/modules`);
    const snapshot = await getDocs(modulesRef);
    return snapshot.size >= CORE_MODULES.length;
  }

  private async checkRolesMigrated(clubId: string): Promise<boolean> {
    const rolesRef = collection(db, `clubs/${clubId}/roles`);
    const snapshot = await getDocs(rolesRef);
    return snapshot.size >= 5; // At least 5 system roles
  }

  private async checkDataMigrated(clubId: string): Promise<boolean> {
    // Check if module_data structure exists
    const metadataRef = doc(db, `clubs/${clubId}/module_data/transactions/metadata`);
    const docSnap = await getDoc(metadataRef);
    return docSnap.exists();
  }

  private log(level: 'info' | 'warning' | 'error' | 'success', message: string): void {
    const log: MigrationLog = {
      timestamp: new Date(),
      level,
      message
    };

    this.logs.push(log);
    this.status.logs.push(log);

    console.log(`[${level.toUpperCase()}] ${message}`);
  }

  private updateProgress(progress: number): void {
    this.status.progress = progress;
    this.log('info', `Progress: ${progress}%`);
  }

  // Public methods
  getStatus(): MigrationStatus {
    return this.status;
  }

  getLogs(): MigrationLog[] {
    return this.logs;
  }
}

// Export singleton
export const moduleMigration = new ModuleMigrationService();
```

---

## PHASE 5 : TESTS ET FINALISATION (2 jours)

### ✅ Phase 5.1 : Tests Unitaires

#### Étape 5.1.1 : Tests du ModuleService
**Fichier** : `src/__tests__/services/moduleService.test.ts`

```typescript
import { moduleService } from '@/services/core/moduleService';
import { CORE_MODULES } from '@/config/modules/coreModules';

describe('ModuleService', () => {
  const testClubId = 'test-club-123';

  beforeEach(async () => {
    await moduleService.initialize(testClubId);
  });

  describe('Module Installation', () => {
    it('should install a module successfully', async () => {
      const moduleId = 'inventory';

      await moduleService.installModule(testClubId, moduleId);

      expect(moduleService.isModuleInstalled(moduleId)).toBe(true);
      expect(moduleService.isModuleActive(moduleId)).toBe(true);
    });

    it('should prevent installing incompatible modules', async () => {
      // Test with incompatible modules if defined
    });

    it('should check dependencies before installation', async () => {
      // Test dependency checking
    });
  });

  describe('Module Permissions', () => {
    it('should grant permissions correctly', async () => {
      const roleId = 'test-role';
      const moduleId = 'transactions';
      const permissionId = 'view';

      await moduleService.grantModulePermission(
        testClubId,
        roleId,
        moduleId,
        permissionId
      );

      const role = moduleService.getRole(roleId);
      expect(role?.modulePermissions[moduleId]).toContain(permissionId);
    });

    it('should check permissions correctly', async () => {
      const userId = 'test-user';
      const moduleId = 'transactions';
      const permissionId = 'view';

      const hasPermission = await moduleService.hasModulePermission(
        userId,
        moduleId,
        permissionId
      );

      expect(typeof hasPermission).toBe('boolean');
    });
  });

  describe('Module Settings', () => {
    it('should update settings with validation', async () => {
      const moduleId = 'transactions';
      const newSettings = {
        'download.autoRenameFiles': true,
        'download.filenamePattern': 'TEST_{YEAR}_{MONTH}'
      };

      await moduleService.updateModuleSettings(
        testClubId,
        moduleId,
        newSettings
      );

      const settings = await moduleService.getModuleSettings(moduleId);
      expect(settings['download.autoRenameFiles']).toBe(true);
    });

    it('should reject invalid settings', async () => {
      const moduleId = 'transactions';
      const invalidSettings = {
        'validation.signatureThreshold': -100 // Invalid: negative number
      };

      await expect(
        moduleService.updateModuleSettings(testClubId, moduleId, invalidSettings)
      ).rejects.toThrow();
    });
  });
});
```

### 📚 Phase 5.2 : Documentation

#### Étape 5.2.1 : Guide d'Administration
**Fichier** : `docs/admin/MODULE_ADMIN_GUIDE.md`

```markdown
# Guide d'Administration des Modules

## Introduction

Le système de modules de CalyCompta permet une gestion flexible et extensible des fonctionnalités.

## Gestion des Modules

### Installation d'un Module

1. Accédez à **Paramètres > Modules**
2. Trouvez le module dans la liste
3. Cliquez sur **Installer**
4. Configurez les paramètres initiaux
5. Activez le module

### Configuration d'un Module

Chaque module dispose de trois sections de configuration :

1. **Paramètres** : Options de fonctionnement
2. **Permissions** : Droits d'accès par rôle
3. **Données** : Gestion des données du module

### Désactivation d'un Module

Pour désactiver temporairement un module :
1. Sélectionnez le module
2. Cliquez sur **Désactiver**
3. Les données sont conservées

## Gestion des Permissions

### Niveaux de Permission

- **Low** : Opérations sans risque (consultation)
- **Medium** : Opérations standards
- **High** : Opérations sensibles
- **Critical** : Opérations système

### Attribution des Permissions

1. Sélectionnez un module
2. Allez dans l'onglet **Permissions**
3. Choisissez un rôle
4. Cochez les permissions à accorder
5. Enregistrez

## Modules Core

### Transactions Bancaires
- Gestion des transactions
- Réconciliation bancaire
- Catégorisation

### Demandes de Remboursement
- Workflow d'approbation
- Gestion des justificatifs
- Suivi des paiements

### Événements
- Organisation d'activités
- Gestion des inscriptions
- Communication

## Modules Optionnels

### Inventaire
- Suivi du matériel
- Gestion des prêts
- Alertes de maintenance

### Excursions
- Voyages organisés
- Réservations
- Gestion financière

## Troubleshooting

### Module ne s'active pas
- Vérifiez les dépendances
- Consultez les logs
- Vérifiez les permissions

### Erreur de migration
- Restaurez depuis la sauvegarde
- Contactez le support
- Consultez les logs de migration
```

---

## 📋 CHECKLIST D'EXÉCUTION COMPLÈTE

### Phase 1 : Infrastructure (Jour 1-3)
- [ ] Créer `src/types/module.types.ts`
- [ ] Créer `src/types/migration.types.ts`
- [ ] Créer `src/services/core/moduleService.ts`
- [ ] Créer `src/config/modules/coreModules.ts`
- [ ] Tester le ModuleService de base

### Phase 2 : Migration (Jour 4-8)
- [ ] Créer `src/services/migration/moduleMigration.ts`
- [ ] Créer script de backup
- [ ] Migrer les rôles existants
- [ ] Migrer les permissions
- [ ] Migrer les paramètres
- [ ] Migrer les données (transactions, demandes, événements)
- [ ] Valider la migration sur environnement de test

### Phase 3 : Interface (Jour 9-12)
- [ ] Créer `src/components/admin/ModuleManager.tsx`
- [ ] Créer `src/components/admin/ModuleDetails.tsx`
- [ ] Créer `src/components/admin/ModuleSettings.tsx`
- [ ] Créer `src/components/admin/ModulePermissions.tsx`
- [ ] Créer `src/components/admin/ModuleData.tsx`
- [ ] Intégrer dans le dashboard des paramètres
- [ ] Tester l'interface complète

### Phase 4 : Security & Deployment (Jour 13-15)
- [ ] Mettre à jour `firestore.rules`
- [ ] Déployer les nouvelles rules
- [ ] Tester les permissions
- [ ] Créer les indexes nécessaires
- [ ] Optimiser les requêtes

### Phase 5 : Tests & Documentation (Jour 16-17)
- [ ] Écrire tests unitaires ModuleService
- [ ] Écrire tests d'intégration
- [ ] Tests de migration sur données réelles
- [ ] Documentation administrateur
- [ ] Documentation développeur
- [ ] Guide de migration

### Phase 6 : Déploiement Production (Jour 18-20)
- [ ] Backup complet de production
- [ ] Migration sur club pilote
- [ ] Validation avec utilisateurs pilotes
- [ ] Migration progressive autres clubs
- [ ] Monitoring post-migration
- [ ] Support utilisateurs

## 🎯 Commandes d'Exécution

```bash
# Installation des dépendances
npm install

# Tests unitaires
npm run test:modules

# Migration en développement
npm run migrate:dev

# Migration en production
npm run migrate:prod --club-id=CLUB_ID

# Rollback si nécessaire
npm run migrate:rollback --club-id=CLUB_ID --backup-id=BACKUP_ID
```

## ⚠️ Points d'Attention Critiques

1. **TOUJOURS faire un backup avant migration**
2. **Tester sur environnement de développement d'abord**
3. **Migrer un club pilote avant tous les autres**
4. **Garder l'ancien code pendant 30 jours minimum**
5. **Monitorer les performances post-migration**
6. **Avoir un plan de rollback prêt**

## 🚀 Ordre d'Exécution Recommandé

1. **Semaine 1** : Infrastructure + Début Migration
2. **Semaine 2** : Interface + Security Rules
3. **Semaine 3** : Tests + Documentation + Déploiement

Ce plan détaillé permet une exécution autonome complète de la migration modulaire.
```

---

Ce plan d'exécution est maintenant prêt pour être implémenté de manière complètement autonome !