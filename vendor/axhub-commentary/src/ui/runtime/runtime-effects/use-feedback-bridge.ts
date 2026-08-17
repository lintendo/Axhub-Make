import React from 'react';
import { App, Button, Input } from 'antd';
import { setWebEditorFeedbackBridge } from '../../feedback-bridge';

type PromptBridgeContentHandle = {
  getValue: () => string;
  setError: (value: string) => void;
  focus: (selectOnOpen: boolean) => void;
};

type PromptBridgeContentProps = {
  content?: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  readOnly?: boolean;
  multiline?: boolean;
  rows?: number;
};

const PromptBridgeContent = React.forwardRef<PromptBridgeContentHandle, PromptBridgeContentProps>(
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
PromptBridgeContent.displayName = 'PromptBridgeContent';

export function useFeedbackBridge(): void {
  const app = App.useApp();

  React.useEffect(() => {
    setWebEditorFeedbackBridge({
      confirm: ({
        title,
        content,
        okText,
        cancelText,
        secondaryText,
        okType,
        getContainer,
        onOk,
        onSecondary,
        onCancel,
      }) => {
        let modalRef: ReturnType<typeof app.modal.confirm> | null = null;
        modalRef = app.modal.confirm({
          className: 'we-runtime-feedback-modal',
          title,
          content,
          okText,
          cancelText,
          okType,
          centered: true,
          closable: true,
          maskClosable: true,
          getContainer,
          cancelButtonProps: cancelText ? undefined : { style: { display: 'none' } },
          footer: secondaryText
            ? (_originNode, { OkBtn }) => React.createElement(
              React.Fragment,
              null,
              React.createElement(
                Button,
                {
                  key: 'secondary',
                  onClick: () => {
                    onSecondary?.();
                    modalRef?.destroy();
                  },
                },
                secondaryText,
              ),
              React.createElement(OkBtn),
            )
            : undefined,
          onOk,
          onCancel,
        });
      },
      alert: ({ title, content, okText, okType, getContainer, onOk }) => {
        app.modal.confirm({
          className: 'we-runtime-feedback-modal',
          title,
          content,
          okText,
          okType,
          centered: true,
          closable: true,
          maskClosable: true,
          getContainer,
          cancelButtonProps: { style: { display: 'none' } },
          onOk,
        });
      },
      prompt: ({
        title,
        content,
        label,
        defaultValue,
        placeholder,
        okText,
        cancelText,
        readOnly,
        multiline,
        rows,
        selectOnOpen,
        validate,
        getContainer,
        onOk,
        onCancel,
      }) => {
        const contentRef = React.createRef<PromptBridgeContentHandle>();
        const modalRef = app.modal.confirm({
          className: 'we-runtime-feedback-modal',
          title,
          content: React.createElement(PromptBridgeContent, {
            ref: contentRef,
            content,
            label,
            defaultValue,
            placeholder,
            readOnly,
            multiline,
            rows,
          }),
          okText,
          cancelText,
          centered: true,
          closable: true,
          maskClosable: true,
          getContainer,
          cancelButtonProps: cancelText ? undefined : { style: { display: 'none' } },
          onOk: () => {
            const nextValue = contentRef.current?.getValue() ?? defaultValue ?? '';
            if (!readOnly) {
              const nextError = validate?.(nextValue) ?? null;
              if (nextError) {
                contentRef.current?.setError(nextError);
                contentRef.current?.focus(Boolean(selectOnOpen));
                return Promise.reject();
              }
            }
            onOk(nextValue);
          },
          onCancel,
        });

        window.setTimeout(() => {
          contentRef.current?.focus(Boolean(selectOnOpen));
        }, 0);

        return modalRef;
      },
      message: ({ type, content }) => {
        app.message.open({
          type,
          content,
          duration: 2,
        });
      },
    });

    return () => {
      setWebEditorFeedbackBridge(null);
    };
  }, [app]);
}
