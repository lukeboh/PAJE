import blessed from "blessed";

export type ListChoice<T> = {
  label: string;
  value: T;
  description?: string;
};

export type TuiSession = {
  screen: any;
  promptInput: (options: { title: string; message: string; defaultValue?: string; description?: string }) => Promise<string | null>;
  promptPassword: (options: { title: string; message: string; description?: string }) => Promise<string | null>;
  promptList: <T>(options: { title: string; message: string; choices: ListChoice<T>[] }) => Promise<T | null>;
  promptForm: <T extends Record<string, string>>(options: {
    title: string;
    fields: { name: keyof T; label: string; defaultValue?: string; secret?: boolean; description?: string }[];
  }) => Promise<T | null>;
  promptConfirm: (options: { title: string; message: string; defaultValue?: boolean }) => Promise<boolean | null>;
  showInlineError: (message: string) => void;
  showMessage: (options: { title: string; message: string }) => Promise<void>;
  destroy: () => void;
};

type PromptContext = {
  screen: any;
  header: any;
  content: any;
  footer: any;
};

const createContext = (title: string): PromptContext => {
  const screen = blessed.screen({ smartCSR: true, fullUnicode: true, title });

  const header = blessed.box({
    parent: screen,
    top: 0,
    height: 3,
    width: "100%",
    border: "line",
    content: title,
    style: { bold: true },
  });

  const content = blessed.box({
    parent: screen,
    top: 3,
    height: "70%",
    width: "100%",
  });

  const footer = blessed.box({
    parent: screen,
    bottom: 0,
    height: "30%",
    width: "100%",
    border: "line",
    content: "",
    tags: true,
  });

  return { screen, header, content, footer };
};

const clearContent = (ctx: PromptContext): void => {
  ctx.screen.removeAllListeners("escape");
  ctx.screen.removeAllListeners("enter");
  ctx.content.children.forEach((child: any) => child.detach());
  ctx.footer.setContent("");
};

export const createTuiSession = (title: string): TuiSession => {
  const ctx = createContext(title);
  const state = {
    inlineError: "",
  };

  const promptInput = async (options: {
    title: string;
    message: string;
    defaultValue?: string;
    description?: string;
  }): Promise<string | null> => {
    return new Promise((resolve) => {
      clearContent(ctx);
      ctx.header.setContent(options.title);

      const box = blessed.box({
        parent: ctx.content,
        border: "line",
        width: "100%",
        height: "100%",
        label: options.message,
      });

      const input = blessed.textbox({
        parent: box,
        top: 2,
        left: 2,
        height: 3,
        width: "95%",
        inputOnFocus: true,
        value: options.defaultValue ?? "",
        border: "line",
      });

      const description = options.description ? `\n${options.description}` : "";
      ctx.footer.tags = true;
      ctx.footer.setContent(`Digite o valor e pressione Enter para confirmar | Esc para cancelar${description}`);

      input.on("submit", (value: string) => {
        resolve(value);
      });

      ctx.screen.key(["escape"], () => resolve(null));
      input.focus();
      ctx.screen.render();
    });
  };

  const promptPassword = async (options: {
    title: string;
    message: string;
    description?: string;
  }): Promise<string | null> => {
    return new Promise((resolve) => {
      clearContent(ctx);
      ctx.header.setContent(options.title);

      const box = blessed.box({
        parent: ctx.content,
        border: "line",
        width: "100%",
        height: "100%",
        label: options.message,
      });

      const input = blessed.textbox({
        parent: box,
        top: 2,
        left: 2,
        height: 3,
        width: "95%",
        inputOnFocus: true,
        censor: true,
        border: "line",
      });

      const description = options.description ? `\n${options.description}` : "";
      ctx.footer.tags = true;
      ctx.footer.setContent(
        `Digite o valor (oculto) e pressione Enter para confirmar | Esc para cancelar${description}`
      );

      input.on("submit", (value: string) => resolve(value));
      ctx.screen.key(["escape"], () => resolve(null));
      input.focus();
      ctx.screen.render();
    });
  };

  const promptList = async <T,>(options: {
    title: string;
    message: string;
    choices: ListChoice<T>[];
  }): Promise<T | null> => {
    return new Promise((resolve) => {
      clearContent(ctx);
      ctx.header.setContent(options.title);

      const list = blessed.list({
        parent: ctx.content,
        label: options.message,
        border: "line",
        width: "100%",
        height: "100%",
        keys: true,
        vi: true,
        items: options.choices.map((choice) => choice.label),
        style: { selected: { bg: "blue" } },
      });

      const updateFooter = (index: number): void => {
        const choice = options.choices[index];
        const description = choice?.description ? `\n${choice.description}` : "";
        ctx.footer.tags = true;
        ctx.footer.setContent(`Use ↑/↓ para navegar e Enter para confirmar | Esc para cancelar${description}`);
        ctx.screen.render();
      };

      list.on("select", (_item: unknown, index: number) => {
        const choice = options.choices[index];
        resolve(choice ? choice.value : null);
      });

      list.on("keypress", () => {
        const index = typeof list.selected === "number" ? list.selected : 0;
        updateFooter(index);
      });

      list.on("focus", () => {
        const index = typeof list.selected === "number" ? list.selected : 0;
        updateFooter(index);
      });

      ctx.screen.key(["escape"], () => resolve(null));
      list.focus();
      updateFooter(0);
      ctx.screen.render();
    });
  };

  const promptForm = async <T extends Record<string, string>>(options: {
    title: string;
    fields: { name: keyof T; label: string; defaultValue?: string; secret?: boolean; description?: string }[];
  }): Promise<T | null> => {
    return new Promise((resolve) => {
      clearContent(ctx);
      ctx.header.setContent(options.title);

      const form = blessed.form({
        parent: ctx.content,
        border: "line",
        width: "100%",
        height: "100%",
        keys: true,
      });

      const inputs: any[] = [];
      const descriptions = new Map<any, string>();
      let top = 2;
      options.fields.forEach((field, index) => {
        blessed.text({
          parent: form,
          top,
          left: 2,
          content: field.label,
        });

        const input = blessed.textbox({
          parent: form,
          top: top + 1,
          left: 2,
          height: 3,
          width: "95%",
          inputOnFocus: true,
          value: field.defaultValue ?? "",
          border: "line",
          censor: field.secret ?? false,
          name: String(field.name),
        });

        inputs.push(input);
        descriptions.set(input, field.description ?? "");
        input.on("submit", () => {
          if (index < inputs.length - 1) {
            inputs[index + 1].focus();
            updateFooter(inputs[index + 1]);
            return;
          }
          form.submit();
        });
        top += 5;
      });

      const updateFooter = (input?: any): void => {
        const description = input ? descriptions.get(input) ?? "" : "";
        const suffix = description ? `\n${description}` : "";
        const error = state.inlineError ? `\n${state.inlineError}` : "";
        ctx.footer.tags = true;
        ctx.footer.setContent(
          `Tab para navegar entre campos | Enter para avançar/confirmar | Esc para cancelar${suffix}${error}`
        );
        ctx.screen.render();
      };

      ctx.footer.tags = true;
      ctx.footer.setContent("Tab para navegar entre campos | Enter para avançar/confirmar | Esc para cancelar");

      form.on("submit", (data: Record<string, string>) => {
        resolve(data as T);
      });

      ctx.screen.key(["enter"], () => form.submit());
      ctx.screen.key(["escape"], () => resolve(null));

      inputs.forEach((input) => {
        input.on("focus", () => updateFooter(input));
      });

      ctx.screen.key(["tab", "down", "up"], () => {
        const focused = ctx.screen.focused;
        updateFooter(focused);
      });

      if (inputs[0]) {
        inputs[0].focus();
        updateFooter(inputs[0]);
      }

      ctx.screen.render();
    });
  };

  const promptConfirm = async (options: {
    title: string;
    message: string;
    defaultValue?: boolean;
  }): Promise<boolean | null> => {
    const defaultValue = options.defaultValue ?? false;
    return promptList<boolean>({
      title: options.title,
      message: options.message,
      choices: [
        { label: "Sim", value: true },
        { label: "Não", value: false },
      ],
    }).then((value) => (value === null ? defaultValue : value));
  };

  const showMessage = async (options: { title: string; message: string }): Promise<void> => {
    return new Promise((resolve) => {
      clearContent(ctx);
      ctx.header.setContent(options.title);

      const box = blessed.box({
        parent: ctx.content,
        border: "line",
        width: "100%",
        height: "100%",
        content: options.message,
        scrollable: true,
      });

      ctx.footer.tags = true;
      ctx.footer.setContent("Pressione Enter para continuar");
      ctx.screen.key(["enter"], () => resolve());
      ctx.screen.render();
    });
  };

  const showInlineError = (message: string): void => {
    state.inlineError = `{red-fg}${message}{/red-fg}`;
    ctx.footer.setContent(
      `Tab para navegar entre campos | Enter para avançar/confirmar | Esc para cancelar\n{red-fg}${message}{/red-fg}`
    );
    ctx.footer.tags = true;
    ctx.screen.render();
  };

  const destroy = (): void => {
    ctx.screen.destroy();
  };

  return {
    screen: ctx.screen,
    promptInput,
    promptPassword,
    promptList,
    promptForm,
    promptConfirm,
    showInlineError,
    showMessage,
    destroy,
  };
};
