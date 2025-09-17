/**
 * Workflow Manager Component
 * Provides UI for managing YouTrack workflow integrations and automations
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { WorkflowEngine, WorkflowRule, WorkflowExecution, WorkflowCondition, WorkflowAction } from '../services/workflow';
import { Logger } from '../services/logger';
import { useNotifications } from './NotificationSystem';
import './WorkflowManager.css';

interface WorkflowManagerProps {
  visible?: boolean;
  onClose?: () => void;
}

export const WorkflowManager: React.FC<WorkflowManagerProps> = ({
  visible = true,
  onClose
}) => {
  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [selectedRule, setSelectedRule] = useState<WorkflowRule | null>(null);
  const [activeTab, setActiveTab] = useState<'rules' | 'executions' | 'create'>('rules');
  const [loading, setLoading] = useState(true);

  const logger = Logger.getLogger('WorkflowManager');
  const { addNotification } = useNotifications();
  const workflowEngine = WorkflowEngine.getInstance();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const rulesData = workflowEngine.getRules();
      const executionsData = workflowEngine.getExecutions();

      setRules(rulesData);
      setExecutions(executionsData.slice(0, 100)); // Show last 100 executions

      logger.info('Workflow data loaded', {
        rulesCount: rulesData.length,
        executionsCount: executionsData.length
      });
    } catch (error) {
      logger.error('Failed to load workflow data', error as Error);
      addNotification({
        type: 'error',
        title: 'Erro ao Carregar Workflows',
        message: 'Falha ao carregar dados dos workflows'
      });
    } finally {
      setLoading(false);
    }
  }, [workflowEngine, logger, addNotification]);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible, loadData]);

  const handleRuleToggle = useCallback(async (ruleId: string, enabled: boolean) => {
    try {
      if (enabled) {
        workflowEngine.enableRule(ruleId);
      } else {
        workflowEngine.disableRule(ruleId);
      }

      await loadData();

      addNotification({
        type: 'success',
        title: 'Workflow Atualizado',
        message: `Workflow ${enabled ? 'ativado' : 'desativado'} com sucesso`
      });
    } catch (error) {
      logger.error('Failed to toggle rule', error as Error);
      addNotification({
        type: 'error',
        title: 'Erro',
        message: 'Falha ao alterar status do workflow'
      });
    }
  }, [workflowEngine, loadData, addNotification, logger]);

  const handleTestRule = useCallback(async (ruleId: string) => {
    try {
      const testContext = {
        timer: {
          id: 'test-timer',
          elapsedMs: 9 * 60 * 60 * 1000, // 9 hours
          status: 'critical',
          username: 'test-user'
        },
        issue: {
          id: 'TEST-123',
          key: 'TEST-123',
          state: 'In Progress',
          projectShortName: 'TEST'
        },
        user: {
          name: 'Test User',
          role: 'developer'
        }
      };

      const execution = await workflowEngine.testRule(ruleId, testContext);

      addNotification({
        type: 'info',
        title: 'Teste de Workflow',
        message: `Workflow testado com sucesso. Status: ${execution.status}`
      });

      await loadData();
    } catch (error) {
      logger.error('Failed to test rule', error as Error);
      addNotification({
        type: 'error',
        title: 'Erro no Teste',
        message: 'Falha ao testar o workflow'
      });
    }
  }, [workflowEngine, addNotification, logger, loadData]);

  const handleDeleteRule = useCallback(async (ruleId: string) => {
    try {
      workflowEngine.removeRule(ruleId);
      await loadData();

      addNotification({
        type: 'success',
        title: 'Workflow Removido',
        message: 'Workflow removido com sucesso'
      });
    } catch (error) {
      logger.error('Failed to delete rule', error as Error);
      addNotification({
        type: 'error',
        title: 'Erro',
        message: 'Falha ao remover workflow'
      });
    }
  }, [workflowEngine, loadData, addNotification, logger]);

  const recentExecutions = useMemo(() => {
    return executions
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 20);
  }, [executions]);

  if (!visible) return null;

  return (
    <div className="workflow-manager">
      <div className="workflow-manager-header">
        <h2>Gerenciamento de Workflows</h2>
        <div className="header-actions">
          <button onClick={loadData} className="refresh-button" disabled={loading}>
            {loading ? '⟳' : '↻'} Atualizar
          </button>
          {onClose && (
            <button onClick={onClose} className="close-button">
              ×
            </button>
          )}
        </div>
      </div>

      <div className="workflow-tabs">
        <button
          className={`tab ${activeTab === 'rules' ? 'active' : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          Regras ({rules.length})
        </button>
        <button
          className={`tab ${activeTab === 'executions' ? 'active' : ''}`}
          onClick={() => setActiveTab('executions')}
        >
          Execuções ({executions.length})
        </button>
        <button
          className={`tab ${activeTab === 'create' ? 'active' : ''}`}
          onClick={() => setActiveTab('create')}
        >
          Criar Nova
        </button>
      </div>

      <div className="workflow-content">
        {activeTab === 'rules' && (
          <RulesTab
            rules={rules}
            selectedRule={selectedRule}
            onSelectRule={setSelectedRule}
            onToggleRule={handleRuleToggle}
            onTestRule={handleTestRule}
            onDeleteRule={handleDeleteRule}
            loading={loading}
          />
        )}

        {activeTab === 'executions' && (
          <ExecutionsTab
            executions={recentExecutions}
            loading={loading}
          />
        )}

        {activeTab === 'create' && (
          <CreateRuleTab
            onRuleCreated={() => {
              loadData();
              setActiveTab('rules');
            }}
          />
        )}
      </div>
    </div>
  );
};

interface RulesTabProps {
  rules: WorkflowRule[];
  selectedRule: WorkflowRule | null;
  onSelectRule: (rule: WorkflowRule | null) => void;
  onToggleRule: (ruleId: string, enabled: boolean) => void;
  onTestRule: (ruleId: string) => void;
  onDeleteRule: (ruleId: string) => void;
  loading: boolean;
}

const RulesTab: React.FC<RulesTabProps> = ({
  rules,
  selectedRule,
  onSelectRule,
  onToggleRule,
  onTestRule,
  onDeleteRule,
  loading
}) => {
  if (loading) {
    return <div className="loading-state">Carregando regras...</div>;
  }

  return (
    <div className="rules-tab">
      <div className="rules-list">
        {rules.map(rule => (
          <div
            key={rule.id}
            className={`rule-item ${selectedRule?.id === rule.id ? 'selected' : ''} ${!rule.enabled ? 'disabled' : ''}`}
            onClick={() => onSelectRule(rule)}
          >
            <div className="rule-header">
              <div className="rule-info">
                <h4 className="rule-name">{rule.name}</h4>
                <p className="rule-description">{rule.description}</p>
              </div>
              <div className="rule-status">
                <span className={`status-badge ${rule.enabled ? 'enabled' : 'disabled'}`}>
                  {rule.enabled ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            </div>
            <div className="rule-meta">
              <span className="rule-priority">Prioridade: {rule.priority}</span>
              <span className="rule-triggers">
                Triggers: {rule.triggerEvents.map(t => t.type).join(', ')}
              </span>
            </div>
            <div className="rule-actions">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleRule(rule.id, !rule.enabled);
                }}
                className="toggle-button"
              >
                {rule.enabled ? 'Desativar' : 'Ativar'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTestRule(rule.id);
                }}
                className="test-button"
              >
                Testar
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('Tem certeza que deseja remover esta regra?')) {
                    onDeleteRule(rule.id);
                  }
                }}
                className="delete-button"
              >
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedRule && (
        <div className="rule-details">
          <h3>Detalhes da Regra: {selectedRule.name}</h3>

          <div className="details-section">
            <h4>Condições</h4>
            <div className="conditions-list">
              {selectedRule.conditions.map((condition, index) => (
                <div key={index} className="condition-item">
                  <span className="condition-type">{condition.type}</span>
                  <span className="condition-operator">{condition.operator}</span>
                  <span className="condition-value">{JSON.stringify(condition.value)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="details-section">
            <h4>Ações</h4>
            <div className="actions-list">
              {selectedRule.actions.map((action, index) => (
                <div key={index} className="action-item">
                  <span className="action-type">{action.type}</span>
                  <div className="action-parameters">
                    {Object.entries(action.parameters).map(([key, value]) => (
                      <div key={key} className="parameter">
                        <strong>{key}:</strong> {JSON.stringify(value)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {selectedRule.schedule && (
            <div className="details-section">
              <h4>Agendamento</h4>
              <div className="schedule-info">
                <div>Tipo: {selectedRule.schedule.type}</div>
                <div>Expressão: {selectedRule.schedule.expression}</div>
                {selectedRule.schedule.timezone && (
                  <div>Timezone: {selectedRule.schedule.timezone}</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface ExecutionsTabProps {
  executions: WorkflowExecution[];
  loading: boolean;
}

const ExecutionsTab: React.FC<ExecutionsTabProps> = ({ executions, loading }) => {
  if (loading) {
    return <div className="loading-state">Carregando execuções...</div>;
  }

  return (
    <div className="executions-tab">
      <div className="executions-list">
        {executions.map(execution => (
          <div key={execution.id} className={`execution-item ${execution.status}`}>
            <div className="execution-header">
              <div className="execution-info">
                <span className="rule-name">Regra: {execution.ruleId}</span>
                <span className="trigger-event">Trigger: {execution.triggerEvent.type}</span>
              </div>
              <div className="execution-status">
                <span className={`status-badge ${execution.status}`}>
                  {execution.status}
                </span>
              </div>
            </div>
            <div className="execution-meta">
              <span className="execution-time">
                Início: {new Date(execution.startTime).toLocaleString()}
              </span>
              {execution.endTime && (
                <span className="execution-duration">
                  Duração: {execution.endTime - execution.startTime}ms
                </span>
              )}
            </div>
            {execution.error && (
              <div className="execution-error">
                Erro: {execution.error}
              </div>
            )}
            <div className="execution-results">
              <strong>Resultados:</strong>
              <pre>{JSON.stringify(execution.results, null, 2)}</pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface CreateRuleTabProps {
  onRuleCreated: () => void;
}

const CreateRuleTab: React.FC<CreateRuleTabProps> = ({ onRuleCreated }) => {
  const [ruleName, setRuleName] = useState('');
  const [ruleDescription, setRuleDescription] = useState('');
  const [priority, setPriority] = useState(1);
  const [conditions, setConditions] = useState<WorkflowCondition[]>([]);
  const [actions, setActions] = useState<WorkflowAction[]>([]);
  const [triggerEvents, setTriggerEvents] = useState<string[]>([]);

  const { addNotification } = useNotifications();
  const workflowEngine = WorkflowEngine.getInstance();

  const handleCreateRule = useCallback(() => {
    if (!ruleName.trim()) {
      addNotification({
        type: 'error',
        title: 'Erro de Validação',
        message: 'Nome da regra é obrigatório'
      });
      return;
    }

    const newRule: WorkflowRule = {
      id: `custom_${Date.now()}`,
      name: ruleName,
      description: ruleDescription,
      enabled: true,
      priority,
      conditions,
      actions,
      triggerEvents: triggerEvents.map(type => ({ type: type as any }))
    };

    try {
      workflowEngine.addRule(newRule);

      addNotification({
        type: 'success',
        title: 'Regra Criada',
        message: 'Nova regra de workflow criada com sucesso'
      });

      onRuleCreated();
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Erro',
        message: 'Falha ao criar regra de workflow'
      });
    }
  }, [ruleName, ruleDescription, priority, conditions, actions, triggerEvents, workflowEngine, addNotification, onRuleCreated]);

  return (
    <div className="create-rule-tab">
      <h3>Criar Nova Regra de Workflow</h3>

      <div className="form-group">
        <label>Nome da Regra:</label>
        <input
          type="text"
          value={ruleName}
          onChange={(e) => setRuleName(e.target.value)}
          placeholder="Nome da regra..."
        />
      </div>

      <div className="form-group">
        <label>Descrição:</label>
        <textarea
          value={ruleDescription}
          onChange={(e) => setRuleDescription(e.target.value)}
          placeholder="Descrição da regra..."
          rows={3}
        />
      </div>

      <div className="form-group">
        <label>Prioridade:</label>
        <input
          type="number"
          value={priority}
          onChange={(e) => setPriority(parseInt(e.target.value))}
          min={1}
          max={10}
        />
      </div>

      <div className="form-section">
        <h4>Eventos de Trigger</h4>
        <div className="trigger-events">
          {['timer_started', 'timer_stopped', 'timer_critical', 'issue_updated'].map(eventType => (
            <label key={eventType} className="checkbox-label">
              <input
                type="checkbox"
                checked={triggerEvents.includes(eventType)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setTriggerEvents([...triggerEvents, eventType]);
                  } else {
                    setTriggerEvents(triggerEvents.filter(t => t !== eventType));
                  }
                }}
              />
              {eventType}
            </label>
          ))}
        </div>
      </div>

      <div className="form-actions">
        <button onClick={handleCreateRule} className="create-button">
          Criar Regra
        </button>
      </div>
    </div>
  );
};

export default WorkflowManager;