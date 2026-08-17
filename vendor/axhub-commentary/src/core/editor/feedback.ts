import React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import { App as AntApp, Button, Input, message, Modal } from 'antd';
import type {
  AlertDialogOptions,
  ConfirmDialogResult,
  ConfirmDialogOptions,
  EditorFeedbackService,
  PromptDialogOptions,
} from './contracts';
import { getWebEditorFeedbackBridge } from '../../ui/feedback-bridge';

type PromptDialogContentHandle = {
  getValue: () => string;
  setError: (value: string) => void;
  focus: (selectOnOpen: boolean) => void;
};

type PromptDialogContentProps = {
  content?: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  readOnly?: boolean;
  multiline?: boolean;
  rows?: number;
};

const PromptDialogContent = React.forwardRef<PromptDialogContentHandle, PromptDialogContentProps>(
  (props, ref) => {
    const [value, setValue] = React.useState(props.defaultValue ?? '');
    const [error, setError] = React.useState('');
    const inputElementRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

    React.useImperativeHandle(ref, () => ({
      getValue: () => value,
      setError: (nextError: string) => {
        setError(nextError);
      },
      focus: (selectOnOpen: boolean) => {
        const target = inputElementRef.current;
        if (!target) return;
        target.focus();
        if (selectOnOpen) {
          target.select();
        }
      },
    }), [value]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValue(event.target.value);
      if (error) {
        setError('');
      }
    };

    const field = props.multiline
      ? React.createElement(Input.TextArea, {
        ref: (instance: any) => {
          inputElementRef.current = instance?.resizableTextArea?.textArea ?? null;
        },
        value,
        rows: props.rows ?? 8,
        readOnly: props.readOnly,
        placeholder: props.placeholder,
        onChange: handleChange,
      })
      : React.createElement(Input, {
        ref: (instance: any) => {
          inputElementRef.current = instance?.input ?? null;
        },
        value,
        readOnly: props.readOnly,
        placeholder: props.placeholder,
        onChange: handleChange,
      });

    return React.createElement(
      'div',
      { style: { display: 'grid', gap: 10 } },
      props.content
        ? React.createElement('div', { style: { whiteSpace: 'pre-line' } }, props.content)
        : null,
      props.label
        ? React.createElement(
          'div',
          { style: { fontSize: 12, fontWeight: 600, color: 'rgba(0,0,0,0.88)' } },
          props.label,
        )
        : null,
      field,
      error
        ? React.createElement(
          'div',
          { style: { fontSize: 12, color: '#ff4d4f' } },
          error,
        )
        : null,
    );
  },
);
PromptDialogContent.displayName = 'PromptDialogContent';

function resolveDialogContainer(uiRoot: HTMLElement | null): HTMLElement {
  if (uiRoot) {
    return uiRoot;
  }
  if (typeof document !== 'undefined') {
    return document.body;
  }
  throw new Error('No dialog container available');
}

function showPromptModal(
  container: HTMLElement,
  options: PromptDialogOptions,
): Promise<string | null> {
  const mountNode = document.createElement('div');
  container.appendChild(mountNode);
  const root = ReactDOMClient.createRoot(mountNode);

  return new Promise((resolve) => {
    const contentRef = React.createRef<PromptDialogContentHandle>();

    const cleanup = () => {
      window.setTimeout(() => {
        root.unmount();
        mountNode.remove();
      }, 0);
    };

    const handleResolve = (value: string | null) => {
      resolve(value);
      cleanup();
    };

    const PromptModal = () => React.createElement(
      AntApp,
      null,
      React.createElement(
        Modal,
        {
          open: true,
          className: 'we-runtime-feedback-modal',
          title: options.title,
          okText: options.confirmText,
          cancelText: options.cancelText,
          centered: true,
          closable: true,
          maskClosable: true,
          destroyOnHidden: true,
          zIndex: 2147483647,
          cancelButtonProps: options.cancelText ? undefined : { style: { display: 'none' } },
          onOk: async () => {
            const nextValue = contentRef.current?.getValue() ?? options.defaultValue ?? '';
            if (!options.readOnly) {
              const nextError = options.validate?.(nextValue) ?? null;
              if (nextError) {
                contentRef.current?.setError(nextError);
                contentRef.current?.focus(Boolean(options.selectOnOpen));
                return Promise.reject();
              }
            }
            handleResolve(nextValue);
          },
          onCancel: () => {
            handleResolve(null);
          },
        },
        React.createElement(PromptDialogContent, {
          ref: contentRef,
          content: options.content,
          label: options.label,
          defaultValue: options.defaultValue,
          placeholder: options.placeholder,
          readOnly: options.readOnly,
          multiline: options.multiline,
          rows: options.rows,
        }),
      ),
    );

    root.render(React.createElement(PromptModal));

    window.setTimeout(() => {
      contentRef.current?.focus(Boolean(options.selectOnOpen));
    }, 0);
  });
}

export function createFeedbackService(options: {
  getUiRoot: () => HTMLElement | null;
}): EditorFeedbackService {
  function confirm(dialog: ConfirmDialogOptions): Promise<ConfirmDialogResult> {
    if (typeof window === 'undefined') {
      return Promise.resolve(Boolean(dialog.cancelText));
    }

    const uiRoot = options.getUiRoot();
    const container = resolveDialogContainer(uiRoot);

    return new Promise((resolve) => {
      let settled = false;
      const settle = (result: ConfirmDialogResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const bridge = getWebEditorFeedbackBridge();
      if (bridge) {
        bridge.confirm({
          title: dialog.title,
          content: dialog.content,
          okText: dialog.confirmText,
          cancelText: dialog.cancelText,
          secondaryText: dialog.secondaryConfirmText,
          okType: dialog.confirmTone === 'primary' ? 'primary' : 'default',
          getContainer: () => container,
          onOk: () => settle(true),
          onSecondary: () => settle('secondary'),
          onCancel: () => settle(false),
        });
        return;
      }

      let modalRef: ReturnType<typeof Modal.confirm> | null = null;
      modalRef = Modal.confirm({
        className: 'we-runtime-feedback-modal',
        title: dialog.title,
        content: dialog.content,
        okText: dialog.confirmText,
        cancelText: dialog.cancelText,
        okType: dialog.confirmTone === 'primary' ? 'primary' : 'default',
        centered: true,
        closable: true,
        maskClosable: true,
        getContainer: () => container,
        cancelButtonProps: dialog.cancelText ? undefined : { style: { display: 'none' } },
        footer: dialog.secondaryConfirmText
          ? (_originNode, { OkBtn }) => React.createElement(
            React.Fragment,
            null,
            React.createElement(
              Button,
              {
                key: 'secondary',
                onClick: () => {
                  settle('secondary');
                  modalRef?.destroy();
                },
              },
              dialog.secondaryConfirmText,
            ),
            React.createElement(OkBtn),
          )
          : undefined,
        onOk: () => settle(true),
        onCancel: () => settle(false),
      });
    });
  }

  function alert(dialog: AlertDialogOptions): Promise<void> {
    if (typeof window === 'undefined') {
      return Promise.resolve();
    }

    const uiRoot = options.getUiRoot();
    const container = resolveDialogContainer(uiRoot);

    return new Promise((resolve) => {
      const bridge = getWebEditorFeedbackBridge();
      if (bridge) {
        bridge.alert({
          title: dialog.title,
          content: dialog.content,
          okText: dialog.confirmText,
          okType: dialog.confirmTone === 'primary' ? 'primary' : 'default',
          getContainer: () => container,
          onOk: resolve,
        });
        return;
      }

      Modal.confirm({
        className: 'we-runtime-feedback-modal',
        title: dialog.title,
        content: dialog.content,
        okText: dialog.confirmText,
        okType: dialog.confirmTone === 'primary' ? 'primary' : 'default',
        centered: true,
        closable: true,
        maskClosable: true,
        getContainer: () => container,
        cancelButtonProps: { style: { display: 'none' } },
        onOk: resolve,
      });
    });
  }

  function prompt(dialog: PromptDialogOptions): Promise<string | null> {
    if (typeof window === 'undefined') {
      return Promise.resolve(dialog.defaultValue ?? null);
    }

    const uiRoot = options.getUiRoot();
    const container = resolveDialogContainer(uiRoot);
    const bridge = getWebEditorFeedbackBridge();

    if (bridge) {
      return new Promise((resolve) => {
        bridge.prompt({
          title: dialog.title,
          content: dialog.content,
          label: dialog.label,
          defaultValue: dialog.defaultValue,
          placeholder: dialog.placeholder,
          okText: dialog.confirmText,
          cancelText: dialog.cancelText,
          readOnly: dialog.readOnly,
          multiline: dialog.multiline,
          rows: dialog.rows,
          selectOnOpen: dialog.selectOnOpen,
          validate: dialog.validate,
          getContainer: () => container,
          onOk: (value) => resolve(value),
          onCancel: () => resolve(null),
        });
      });
    }

    return showPromptModal(container, dialog);
  }

  function toast(type: 'success' | 'info' | 'warning' | 'error', content: string): void {
    if (typeof window === 'undefined') return;
    try {
      const uiRoot = options.getUiRoot();
      const bridge = getWebEditorFeedbackBridge();
      if (uiRoot && bridge) {
        bridge.message({
          type,
          content,
        });
        return;
      }

      if (uiRoot) {
        message.config({
          getContainer: () => uiRoot,
        });
      }
      void message.open({ type, content });
    } catch {
      // Best-effort only.
    }
  }

  return { confirm, alert, prompt, toast };
}
