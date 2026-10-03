import React from 'react';
import { DeleteOutlined } from '@ant-design/icons';
import { Empty, Popconfirm, Segmented } from 'antd';
import type { TransactionManager } from '../../core/transaction-manager';
import type { DesignTokensService } from '../../core/design-tokens';
import {
  AppearanceSection,
  BorderSection,
  CommonColorsSection,
  createStyleSnapshot,
  EffectsSection,
  SizeSection,
  SpacingSection,
  TypographySection,
  type SectionProps,
  type StyleSnapshot,
} from '../property-panel/react-design-panel';
import { PromptCardScrollArea } from './prompt-card-scroll-area';
import { resolveRuntimePopupContainer } from './popup-container';
import { IconActionButton } from './action-buttons';

type PromptCardDesignGroupId = 'layout' | 'colors' | 'typography' | 'border';

export interface PromptCardDesignEditorProps {
  target: Element | null;
  transactionManager: TransactionManager;
  tokensService?: DesignTokensService;
  disabled?: boolean;
  refreshKey: number;
  onRefreshRequest?: () => void;
  onDeleteElement?: (element: Element) => boolean | Promise<boolean>;
  defaultGroupId?: PromptCardDesignGroupId;
}

interface DesignGroupDefinition {
  id: PromptCardDesignGroupId;
  label: string;
  render: (props: SectionProps & { snapshot: StyleSnapshot }) => React.ReactElement;
}

const mergedGroupStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

function PromptCardGroupDivider(): React.ReactElement {
  return <div className="we-runtime-prompt-card__group-divider" aria-hidden="true" />;
}

function PromptCardLayoutPanel(
  props: SectionProps & { snapshot: StyleSnapshot },
): React.ReactElement {
  return (
    <div style={mergedGroupStackStyle}>
      <SpacingSection {...props} />
      <PromptCardGroupDivider />
      <SizeSection {...props} variant="prompt-card" />
    </div>
  );
}

function PromptCardTypographyPanel(
  props: SectionProps & { snapshot: StyleSnapshot },
): React.ReactElement {
  return <TypographySection {...props} variant="prompt-card" />;
}

function PromptCardCommonColorsPanel(
  props: SectionProps & { snapshot: StyleSnapshot },
): React.ReactElement {
  return (
    <div style={mergedGroupStackStyle}>
      <CommonColorsSection {...props} />
      <PromptCardGroupDivider />
      <AppearanceSection {...props} />
    </div>
  );
}

function PromptCardBorderEffectsPanel(
  props: SectionProps & { snapshot: StyleSnapshot },
): React.ReactElement {
  return (
    <div style={mergedGroupStackStyle}>
      <BorderSection {...props} hideColorField />
      <PromptCardGroupDivider />
      <EffectsSection {...props} variant="prompt-card" />
    </div>
  );
}

const GROUPS: DesignGroupDefinition[] = [
  { id: 'layout', label: '布局', render: PromptCardLayoutPanel },
  { id: 'colors', label: '颜色', render: PromptCardCommonColorsPanel },
  { id: 'typography', label: '文字', render: PromptCardTypographyPanel },
  { id: 'border', label: '边框', render: PromptCardBorderEffectsPanel },
];

const tabStripStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '0 0 6px',
};

const editorShellStyle: React.CSSProperties = {
  padding: '0 8px 6px',
};

const contentStyle: React.CSSProperties = {
  maxHeight: 236,
  minHeight: 0,
};

export function PromptCardDesignEditor(props: PromptCardDesignEditorProps): React.ReactElement {
  const {
    target,
    transactionManager,
    tokensService,
    disabled,
    refreshKey,
    onRefreshRequest,
    onDeleteElement,
    defaultGroupId = 'colors',
  } = props;
  const [activeGroupId, setActiveGroupId] = React.useState<PromptCardDesignGroupId>(defaultGroupId);
  const snapshot = React.useMemo(
    () => (target ? createStyleSnapshot(target) : null),
    [target, refreshKey],
  );

  React.useEffect(() => {
    setActiveGroupId((current) => {
      if (GROUPS.some((group) => group.id === current)) {
        return current;
      }
      return defaultGroupId;
    });
  }, [defaultGroupId]);

  if (!target || !snapshot) {
    return (
      <div style={{ paddingTop: 10 }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="请选择一个元素后开始编辑。"
          style={{ margin: 0, padding: '8px 0 2px' }}
        />
      </div>
    );
  }

  const sectionProps: SectionProps & { snapshot: StyleSnapshot } = {
    target,
    transactionManager,
    tokensService,
    disabled,
    onRefreshRequest,
    snapshot,
  };
  const activeGroup = GROUPS.find((group) => group.id === activeGroupId) ?? GROUPS[0];
  const ActiveGroupPanel = activeGroup.render;

  return (
    <div data-we-prompt-primary-focus-exempt="true" style={editorShellStyle}>
      <div style={tabStripStyle}>
        <Segmented
          value={activeGroup.id}
          options={GROUPS.map((group) => ({
            label: group.label,
            value: group.id,
          }))}
          onChange={(value) => setActiveGroupId(String(value) as PromptCardDesignGroupId)}
        />
        <Popconfirm
          title="删除当前元素"
          description="删除后会在父级创建批注；撤销或清空该批注可恢复元素。"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          disabled={disabled || !onDeleteElement}
          getPopupContainer={resolveRuntimePopupContainer}
          onConfirm={() => onDeleteElement?.(target)}
        >
          <span style={{ display: 'inline-flex' }}>
            <IconActionButton
              title="删除当前元素（Delete / Backspace）"
              icon={<DeleteOutlined />}
              tone="dark"
              disabled={disabled || !onDeleteElement}
            />
          </span>
        </Popconfirm>
      </div>
      <PromptCardScrollArea style={contentStyle}>
        <ActiveGroupPanel {...sectionProps} />
      </PromptCardScrollArea>
    </div>
  );
}
