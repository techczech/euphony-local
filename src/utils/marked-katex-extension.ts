// Define regular expressions for inline and block KaTeX parsing
const inlineRule =
  /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\1(?=[\s?!\.,:？！。，：]|$)/;
const inlineRuleNonStandard = /^(?:\$(?!\$)([^\$\n]+?)\$|\\\((.+?)\\\))/;
const blockRule = /^(?:\$\$)([\s\S]+?)\$\$|^\\\[((?:\\.|[^\\])+?)\\\]/;

// Define the options interface for KaTeX rendering
export interface MarkedKatexOptions {
  nonStandard?: boolean;
  [key: string]: unknown;
}

declare const katex: {
  render: (tex: string, element: HTMLElement, options?: unknown) => void;
  renderToString: (tex: string, options?: unknown) => string;
};

// Define the token interface for rendering
interface Token {
  text: string;
  displayMode: boolean;
}

// Export the default function for creating KaTeX extensions
export default function (options: MarkedKatexOptions = {}) {
  return {
    extensions: [
      inlineKatex(options, createRenderer(options, false)),
      blockKatex(options, createRenderer(options, true))
    ]
  };
}

// Create a renderer function for KaTeX
function createRenderer(options: MarkedKatexOptions, newlineAfter: boolean) {
  return (token: Token) =>
    katex.renderToString(token.text, {
      ...options,
      displayMode: token.displayMode
    }) + (newlineAfter ? '\n' : '');
}

// Define the inline KaTeX extension
function inlineKatex(
  options: MarkedKatexOptions,
  renderer: (token: Token) => string
) {
  const nonStandard = options.nonStandard;
  const ruleReg = nonStandard ? inlineRuleNonStandard : inlineRule;
  return {
    name: 'inlineKatex',
    level: 'inline',
    start(src: string) {
      const dollarIndex = src.indexOf('$');
      const parenIndex = src.indexOf('\\(');

      // If both are missing, exit
      if (dollarIndex === -1 && parenIndex === -1) {
        return;
      }

      const earliestIndex =
        dollarIndex === -1
          ? parenIndex
          : parenIndex === -1
            ? dollarIndex
            : Math.min(dollarIndex, parenIndex);

      // Slice from the earliest possible match position
      const possibleKatex = src.slice(earliestIndex);

      if (possibleKatex.match(ruleReg)) {
        return earliestIndex;
      }
    },
    tokenizer(src: string) {
      const match = inlineRuleNonStandard.exec(src);
      if (match) {
        return {
          type: 'inlineKatex',
          raw: match[0],
          text: (match[1] || match[2]).trim(),
          displayMode: false
        };
      }
    },
    renderer
  };
}

// Define the block KaTeX extension
function blockKatex(
  options: MarkedKatexOptions,
  renderer: (token: Token) => string
) {
  return {
    name: 'blockKatex',
    level: 'block',
    tokenizer(src: string) {
      const match = blockRule.exec(src);
      if (match) {
        const content = match[1] || match[2];
        return {
          type: 'blockKatex',
          raw: match[0],
          text: content.trim(),
          displayMode: true
        };
      }
    },
    renderer
  };
}
