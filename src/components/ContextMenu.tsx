/**
 * Advanced Context Menu System
 * Provides right-click context menus with keyboard navigation and accessibility
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './ContextMenu.css';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  submenu?: ContextMenuItem[];
}

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ContextMenuState {
  items: ContextMenuItem[];
  position: ContextMenuPosition;
  visible: boolean;
  targetElement?: HTMLElement;
}

interface ContextMenuContextType {
  showContextMenu: (event: React.MouseEvent, items: ContextMenuItem[]) => void;
  hideContextMenu: () => void;
  isVisible: boolean;
}

const ContextMenuContext = createContext<ContextMenuContextType | null>(null);

export const useContextMenu = () => {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error('useContextMenu must be used within ContextMenuProvider');
  }
  return context;
};

export const ContextMenuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [menuState, setMenuState] = useState<ContextMenuState>({
    items: [],
    position: { x: 0, y: 0 },
    visible: false
  });

  const showContextMenu = useCallback((event: React.MouseEvent, items: ContextMenuItem[]) => {
    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;

    setMenuState({
      items,
      position: { x, y },
      visible: true,
      targetElement: event.currentTarget as HTMLElement
    });
  }, []);

  const hideContextMenu = useCallback(() => {
    setMenuState(prev => ({ ...prev, visible: false }));
  }, []);

  // Hide menu on outside click or escape
  useEffect(() => {
    const handleGlobalClick = (event: MouseEvent) => {
      if (menuState.visible) {
        hideContextMenu();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuState.visible) {
        hideContextMenu();
      }
    };

    document.addEventListener('click', handleGlobalClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleGlobalClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuState.visible, hideContextMenu]);

  const contextValue = {
    showContextMenu,
    hideContextMenu,
    isVisible: menuState.visible
  };

  return (
    <ContextMenuContext.Provider value={contextValue}>
      {children}
      {menuState.visible && (
        <ContextMenuRenderer
          items={menuState.items}
          position={menuState.position}
          onClose={hideContextMenu}
        />
      )}
    </ContextMenuContext.Provider>
  );
};

interface ContextMenuRendererProps {
  items: ContextMenuItem[];
  position: ContextMenuPosition;
  onClose: () => void;
}

const ContextMenuRenderer: React.FC<ContextMenuRendererProps> = ({
  items,
  position,
  onClose
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [submenuState, setSubmenuState] = useState<{
    visible: boolean;
    items: ContextMenuItem[];
    position: ContextMenuPosition;
  }>({ visible: false, items: [], position: { x: 0, y: 0 } });

  // Adjust position if menu would go off screen
  const getAdjustedPosition = () => {
    if (!menuRef.current) return position;

    const menuRect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let { x, y } = position;

    // Adjust horizontal position
    if (x + menuRect.width > viewportWidth) {
      x = viewportWidth - menuRect.width - 10;
    }

    // Adjust vertical position
    if (y + menuRect.height > viewportHeight) {
      y = viewportHeight - menuRect.height - 10;
    }

    return { x: Math.max(10, x), y: Math.max(10, y) };
  };

  const adjustedPosition = getAdjustedPosition();

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!menuRef.current) return;

      const enabledItems = items.filter(item => !item.disabled && !item.separator);

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setSelectedIndex(prev => {
            const nextIndex = prev + 1;
            return nextIndex >= enabledItems.length ? 0 : nextIndex;
          });
          break;

        case 'ArrowUp':
          event.preventDefault();
          setSelectedIndex(prev => {
            const nextIndex = prev - 1;
            return nextIndex < 0 ? enabledItems.length - 1 : nextIndex;
          });
          break;

        case 'ArrowRight':
          if (selectedIndex >= 0 && enabledItems[selectedIndex]?.submenu) {
            // Show submenu
            const item = enabledItems[selectedIndex];
            const itemElement = menuRef.current?.children[selectedIndex] as HTMLElement;
            if (itemElement) {
              const rect = itemElement.getBoundingClientRect();
              setSubmenuState({
                visible: true,
                items: item.submenu!,
                position: { x: rect.right, y: rect.top }
              });
            }
          }
          break;

        case 'ArrowLeft':
          if (submenuState.visible) {
            setSubmenuState(prev => ({ ...prev, visible: false }));
          }
          break;

        case 'Enter':
          if (selectedIndex >= 0) {
            const item = enabledItems[selectedIndex];
            if (!item.submenu) {
              item.onClick();
              onClose();
            }
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedIndex, submenuState.visible, onClose]);

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled) return;

    if (item.submenu) {
      // Show submenu (handled by hover/keyboard)
      return;
    }

    item.onClick();
    onClose();
  };

  const handleItemHover = (item: ContextMenuItem, index: number, event: React.MouseEvent) => {
    setSelectedIndex(index);

    if (item.submenu) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      setSubmenuState({
        visible: true,
        items: item.submenu,
        position: { x: rect.right, y: rect.top }
      });
    } else {
      setSubmenuState(prev => ({ ...prev, visible: false }));
    }
  };

  return createPortal(
    <>
      <div
        ref={menuRef}
        className="context-menu"
        style={{
          left: adjustedPosition.x,
          top: adjustedPosition.y
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item, index) => (
          <React.Fragment key={item.id}>
            {item.separator ? (
              <div className="context-menu-separator" />
            ) : (
              <div
                className={`context-menu-item ${item.disabled ? 'disabled' : ''} ${item.danger ? 'danger' : ''} ${selectedIndex === index ? 'selected' : ''}`}
                onClick={() => handleItemClick(item)}
                onMouseEnter={(e) => handleItemHover(item, index, e)}
              >
                <div className="context-menu-item-content">
                  {item.icon && (
                    <span className="context-menu-item-icon">{item.icon}</span>
                  )}
                  <span className="context-menu-item-label">{item.label}</span>
                  {item.submenu && (
                    <span className="context-menu-item-arrow">▶</span>
                  )}
                </div>
                {item.shortcut && (
                  <span className="context-menu-item-shortcut">{item.shortcut}</span>
                )}
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {submenuState.visible && (
        <ContextMenuRenderer
          items={submenuState.items}
          position={submenuState.position}
          onClose={onClose}
        />
      )}
    </>,
    document.body
  );
};

// Hook for timer-specific context menus
export const useTimerContextMenu = () => {
  const { showContextMenu } = useContextMenu();

  const showTimerMenu = useCallback((event: React.MouseEvent, timerData: any) => {
    const items: ContextMenuItem[] = [
      {
        id: 'view-details',
        label: 'Ver Detalhes',
        icon: '👁️',
        shortcut: 'Enter',
        onClick: () => {
          console.log('View timer details', timerData);
        }
      },
      {
        id: 'copy-link',
        label: 'Copiar Link da Issue',
        icon: '🔗',
        shortcut: 'Ctrl+C',
        onClick: () => {
          navigator.clipboard.writeText(`https://youtrack.example.com/issue/${timerData.issueKey}`);
        }
      },
      {
        id: 'separator-1',
        label: '',
        separator: true,
        onClick: () => {}
      },
      {
        id: 'timer-actions',
        label: 'Ações do Timer',
        icon: '⏱️',
        submenu: [
          {
            id: 'pause-timer',
            label: 'Pausar Timer',
            icon: '⏸️',
            onClick: () => {
              console.log('Pause timer', timerData);
            }
          },
          {
            id: 'stop-timer',
            label: 'Parar Timer',
            icon: '⏹️',
            danger: true,
            onClick: () => {
              console.log('Stop timer', timerData);
            }
          }
        ],
        onClick: () => {}
      },
      {
        id: 'user-actions',
        label: 'Ações do Usuário',
        icon: '👤',
        submenu: [
          {
            id: 'view-user-timers',
            label: 'Ver Todos os Timers',
            icon: '📊',
            onClick: () => {
              console.log('View all user timers', timerData.username);
            }
          },
          {
            id: 'send-message',
            label: 'Enviar Mensagem',
            icon: '💬',
            onClick: () => {
              console.log('Send message to user', timerData.username);
            }
          }
        ],
        onClick: () => {}
      },
      {
        id: 'separator-2',
        label: '',
        separator: true,
        onClick: () => {}
      },
      {
        id: 'export-data',
        label: 'Exportar Dados',
        icon: '📤',
        onClick: () => {
          console.log('Export timer data', timerData);
        }
      },
      {
        id: 'report-issue',
        label: 'Reportar Problema',
        icon: '🐛',
        onClick: () => {
          console.log('Report issue with timer', timerData);
        }
      }
    ];

    showContextMenu(event, items);
  }, [showContextMenu]);

  const showProjectMenu = useCallback((event: React.MouseEvent, projectData: any) => {
    const items: ContextMenuItem[] = [
      {
        id: 'view-project',
        label: 'Ver Projeto',
        icon: '📁',
        onClick: () => {
          console.log('View project', projectData);
        }
      },
      {
        id: 'project-analytics',
        label: 'Analytics do Projeto',
        icon: '📊',
        onClick: () => {
          console.log('View project analytics', projectData);
        }
      },
      {
        id: 'separator-1',
        label: '',
        separator: true,
        onClick: () => {}
      },
      {
        id: 'export-project-data',
        label: 'Exportar Dados do Projeto',
        icon: '📤',
        onClick: () => {
          console.log('Export project data', projectData);
        }
      }
    ];

    showContextMenu(event, items);
  }, [showContextMenu]);

  return {
    showTimerMenu,
    showProjectMenu
  };
};

export default {
  ContextMenuProvider,
  useContextMenu,
  useTimerContextMenu
};