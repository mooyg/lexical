/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {
  CommandPayloadType,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  ElementFormatType,
  LexicalCommand,
  LexicalEditor,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  ParagraphNode,
  PasteCommandType,
  RangeSelection,
  SerializedElementNode,
  Spread,
  TextFormatType,
} from 'lexical';

import {
  $insertDataTransferForRichText,
  copyToClipboard,
} from '@lexical/clipboard';
import {
  $moveCharacter,
  $shouldOverrideDefaultCharacterSelection,
} from '@lexical/selection';
import {
  $findMatchingParent,
  $getNearestBlockElementAncestorOrThrow,
  addClassNamesToElement,
  isHTMLElement,
  mergeRegister,
  objectKlassEquals,
} from '@lexical/utils';
import {
  $applyNodeReplacement,
  $createParagraphNode,
  $createRangeSelection,
  $createTabNode,
  $getAdjacentNode,
  $getNearestNodeFromDOMNode,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isDecoratorNode,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isRootNode,
  $isTextNode,
  $normalizeSelection__EXPERIMENTAL,
  $selectAll,
  $setSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  COPY_COMMAND,
  createCommand,
  CUT_COMMAND,
  DELETE_CHARACTER_COMMAND,
  DELETE_LINE_COMMAND,
  DELETE_WORD_COMMAND,
  DRAGOVER_COMMAND,
  DRAGSTART_COMMAND,
  DROP_COMMAND,
  ElementNode,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  INSERT_TAB_COMMAND,
  isDOMNode,
  isSelectionCapturedInDecoratorInput,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_SPACE_COMMAND,
  KEY_TAB_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  PASTE_COMMAND,
  PASTE_TAG,
  REMOVE_TEXT_COMMAND,
  SELECT_ALL_COMMAND,
  setNodeIndentFromDOM,
} from 'lexical';
import caretFromPoint from 'shared/caretFromPoint';
import {
  CAN_USE_BEFORE_INPUT,
  IS_APPLE_WEBKIT,
  IS_IOS,
  IS_SAFARI,
} from 'shared/environment';

export type SerializedHeadingNode = Spread<
  {
    tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  },
  SerializedElementNode
>;

export const DRAG_DROP_PASTE: LexicalCommand<Array<File>> = createCommand(
  'DRAG_DROP_PASTE_FILE',
);

export type SerializedQuoteNode = SerializedElementNode;

/** @noInheritDoc */
export class QuoteNode extends ElementNode {
  static getType(): string {
    return 'quote';
  }

  static clone(node: QuoteNode): QuoteNode {
    return new QuoteNode(node.__key);
  }

  // View

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('blockquote');
    addClassNamesToElement(element, config.theme.quote);
    return element;
  }
  updateDOM(prevNode: this, dom: HTMLElement): boolean {
    return false;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      blockquote: (node: Node) => ({
        conversion: $convertBlockquoteElement,
        priority: 0,
      }),
    };
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const {element} = super.exportDOM(editor);

    if (isHTMLElement(element)) {
      if (this.isEmpty()) {
        element.append(document.createElement('br'));
      }

      const formatType = this.getFormatType();
      if (formatType) {
        element.style.textAlign = formatType;
      }

      const direction = this.getDirection();
      if (direction) {
        element.dir = direction;
      }
    }

    return {
      element,
    };
  }

  static importJSON(serializedNode: SerializedQuoteNode): QuoteNode {
    return $createQuoteNode().updateFromJSON(serializedNode);
  }

  // Mutation

  insertNewAfter(_: RangeSelection, restoreSelection?: boolean): ParagraphNode {
    const newBlock = $createParagraphNode();
    const direction = this.getDirection();
    newBlock.setDirection(direction);
    this.insertAfter(newBlock, restoreSelection);
    return newBlock;
  }

  collapseAtStart(): true {
    const paragraph = $createParagraphNode();
    const children = this.getChildren();
    children.forEach((child) => paragraph.append(child));
    this.replace(paragraph);
    return true;
  }

  canMergeWhenEmpty(): true {
    return true;
  }
}

export function $createQuoteNode(): QuoteNode {
  return $applyNodeReplacement(new QuoteNode());
}

export function $isQuoteNode(
  node: LexicalNode | null | undefined,
): node is QuoteNode {
  return node instanceof QuoteNode;
}

export type HeadingTagType = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

/** @noInheritDoc */
export class HeadingNode extends ElementNode {
  /** @internal */
  __tag: HeadingTagType;

  static getType(): string {
    return 'heading';
  }

  static clone(node: HeadingNode): HeadingNode {
    return new HeadingNode(node.__tag, node.__key);
  }

  constructor(tag: HeadingTagType, key?: NodeKey) {
    super(key);
    this.__tag = tag;
  }

  getTag(): HeadingTagType {
    return this.__tag;
  }

  setTag(tag: HeadingTagType): this {
    const self = this.getWritable();
    this.__tag = tag;
    return self;
  }

  // View

  createDOM(config: EditorConfig): HTMLElement {
    const tag = this.__tag;
    const element = document.createElement(tag);
    const theme = config.theme;
    const classNames = theme.heading;
    if (classNames !== undefined) {
      const className = classNames[tag];
      addClassNamesToElement(element, className);
    }
    return element;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    return prevNode.__tag !== this.__tag;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      h1: (node: Node) => ({
        conversion: $convertHeadingElement,
        priority: 0,
      }),
      h2: (node: Node) => ({
        conversion: $convertHeadingElement,
        priority: 0,
      }),
      h3: (node: Node) => ({
        conversion: $convertHeadingElement,
        priority: 0,
      }),
      h4: (node: Node) => ({
        conversion: $convertHeadingElement,
        priority: 0,
      }),
      h5: (node: Node) => ({
        conversion: $convertHeadingElement,
        priority: 0,
      }),
      h6: (node: Node) => ({
        conversion: $convertHeadingElement,
        priority: 0,
      }),
      p: (node: Node) => {
        // domNode is a <p> since we matched it by nodeName
        const paragraph = node as HTMLParagraphElement;
        const firstChild = paragraph.firstChild;
        if (firstChild !== null && isGoogleDocsTitle(firstChild)) {
          return {
            conversion: () => ({node: null}),
            priority: 3,
          };
        }
        return null;
      },
      span: (node: Node) => {
        if (isGoogleDocsTitle(node)) {
          return {
            conversion: (domNode: Node) => {
              return {
                node: $createHeadingNode('h1'),
              };
            },
            priority: 3,
          };
        }
        return null;
      },
    };
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const {element} = super.exportDOM(editor);

    if (isHTMLElement(element)) {
      if (this.isEmpty()) {
        element.append(document.createElement('br'));
      }

      const formatType = this.getFormatType();
      if (formatType) {
        element.style.textAlign = formatType;
      }

      const direction = this.getDirection();
      if (direction) {
        element.dir = direction;
      }
    }

    return {
      element,
    };
  }

  static importJSON(serializedNode: SerializedHeadingNode): HeadingNode {
    return $createHeadingNode(serializedNode.tag).updateFromJSON(
      serializedNode,
    );
  }

  updateFromJSON(
    serializedNode: LexicalUpdateJSON<SerializedHeadingNode>,
  ): this {
    return super.updateFromJSON(serializedNode).setTag(serializedNode.tag);
  }

  exportJSON(): SerializedHeadingNode {
    return {
      ...super.exportJSON(),
      tag: this.getTag(),
    };
  }

  // Mutation
  insertNewAfter(
    selection?: RangeSelection,
    restoreSelection = true,
  ): ParagraphNode | HeadingNode {
    const anchorOffet = selection ? selection.anchor.offset : 0;
    const lastDesc = this.getLastDescendant();
    const isAtEnd =
      !lastDesc ||
      (selection &&
        selection.anchor.key === lastDesc.getKey() &&
        anchorOffet === lastDesc.getTextContentSize());
    const newElement =
      isAtEnd || !selection
        ? $createParagraphNode()
        : $createHeadingNode(this.getTag());
    const direction = this.getDirection();
    newElement.setDirection(direction);
    this.insertAfter(newElement, restoreSelection);
    if (anchorOffet === 0 && !this.isEmpty() && selection) {
      const paragraph = $createParagraphNode();
      paragraph.select();
      this.replace(paragraph, true);
    }
    return newElement;
  }

  collapseAtStart(): true {
    const newElement = !this.isEmpty()
      ? $createHeadingNode(this.getTag())
      : $createParagraphNode();
    const children = this.getChildren();
    children.forEach((child) => newElement.append(child));
    this.replace(newElement);
    return true;
  }

  extractWithChild(): boolean {
    return true;
  }
}

function isGoogleDocsTitle(domNode: Node): boolean {
  if (domNode.nodeName.toLowerCase() === 'span') {
    return (domNode as HTMLSpanElement).style.fontSize === '26pt';
  }
  return false;
}

function $convertHeadingElement(element: HTMLElement): DOMConversionOutput {
  const nodeName = element.nodeName.toLowerCase();
  let node = null;
  if (
    nodeName === 'h1' ||
    nodeName === 'h2' ||
    nodeName === 'h3' ||
    nodeName === 'h4' ||
    nodeName === 'h5' ||
    nodeName === 'h6'
  ) {
    node = $createHeadingNode(nodeName);
    if (element.style !== null) {
      setNodeIndentFromDOM(element, node);
      node.setFormat(element.style.textAlign as ElementFormatType);
    }
  }
  return {node};
}

function $convertBlockquoteElement(element: HTMLElement): DOMConversionOutput {
  const node = $createQuoteNode();
  if (element.style !== null) {
    node.setFormat(element.style.textAlign as ElementFormatType);
    setNodeIndentFromDOM(element, node);
  }
  return {node};
}

export function $createHeadingNode(
  headingTag: HeadingTagType = 'h1',
): HeadingNode {
  return $applyNodeReplacement(new HeadingNode(headingTag));
}

export function $isHeadingNode(
  node: LexicalNode | null | undefined,
): node is HeadingNode {
  return node instanceof HeadingNode;
}

function onPasteForRichText(
  event: CommandPayloadType<typeof PASTE_COMMAND>,
  editor: LexicalEditor,
): void {
  event.preventDefault();
  editor.update(
    () => {
      const selection = $getSelection();
      const clipboardData =
        objectKlassEquals(event, InputEvent) ||
        objectKlassEquals(event, KeyboardEvent)
          ? null
          : event.clipboardData;
      if (clipboardData != null && selection !== null) {
        $insertDataTransferForRichText(clipboardData, selection, editor);
      }
    },
    {
      tag: PASTE_TAG,
    },
  );
}

async function onCutForRichText(
  event: CommandPayloadType<typeof CUT_COMMAND>,
  editor: LexicalEditor,
): Promise<void> {
  await copyToClipboard(
    editor,
    objectKlassEquals(event, ClipboardEvent) ? event : null,
  );
  editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      selection.removeText();
    } else if ($isNodeSelection(selection)) {
      selection.getNodes().forEach((node) => node.remove());
    }
  });
}

// Clipboard may contain files that we aren't allowed to read. While the event is arguably useless,
// in certain occasions, we want to know whether it was a file transfer, as opposed to text. We
// control this with the first boolean flag.
export function eventFiles(
  event: DragEvent | PasteCommandType,
): [boolean, Array<File>, boolean] {
  let dataTransfer: null | DataTransfer = null;
  if (objectKlassEquals(event, DragEvent)) {
    dataTransfer = event.dataTransfer;
  } else if (objectKlassEquals(event, ClipboardEvent)) {
    dataTransfer = event.clipboardData;
  }

  if (dataTransfer === null) {
    return [false, [], false];
  }

  const types = dataTransfer.types;
  const hasFiles = types.includes('Files');
  const hasContent =
    types.includes('text/html') || types.includes('text/plain');
  return [hasFiles, Array.from(dataTransfer.files), hasContent];
}

function $handleIndentAndOutdent(
  indentOrOutdent: (block: ElementNode) => void,
): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return false;
  }
  const alreadyHandled = new Set();
  const nodes = selection.getNodes();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const key = node.getKey();
    if (alreadyHandled.has(key)) {
      continue;
    }
    const parentBlock = $findMatchingParent(
      node,
      (parentNode): parentNode is ElementNode =>
        $isElementNode(parentNode) && !parentNode.isInline(),
    );
    if (parentBlock === null) {
      continue;
    }
    const parentKey = parentBlock.getKey();
    if (parentBlock.canIndent() && !alreadyHandled.has(parentKey)) {
      alreadyHandled.add(parentKey);
      indentOrOutdent(parentBlock);
    }
  }
  return alreadyHandled.size > 0;
}

function $isTargetWithinDecorator(target: HTMLElement): boolean {
  const node = $getNearestNodeFromDOMNode(target);
  return $isDecoratorNode(node);
}

function $isSelectionAtEndOfRoot(selection: RangeSelection) {
  const focus = selection.focus;
  return focus.key === 'root' && focus.offset === $getRoot().getChildrenSize();
}

function $isSelectionCollapsedAtFrontOfIndentedBlock(
  selection: RangeSelection,
): boolean {
  if (!selection.isCollapsed()) {
    return false;
  }
  const {anchor} = selection;
  if (anchor.offset !== 0) {
    return false;
  }
  const anchorNode = anchor.getNode();
  if ($isRootNode(anchorNode)) {
    return false;
  }
  const element = $getNearestBlockElementAncestorOrThrow(anchorNode);
  return (
    element.getIndent() > 0 &&
    (element.is(anchorNode) || anchorNode.is(element.getFirstDescendant()))
  );
}

/**
 * Resets the capitalization of the selection to default.
 * Called when the user presses space, tab, or enter key.
 * @param selection The selection to reset the capitalization of.
 */
function $resetCapitalization(selection: RangeSelection): void {
  for (const format of ['lowercase', 'uppercase', 'capitalize'] as const) {
    if (selection.hasFormat(format)) {
      selection.toggleFormat(format);
    }
  }
}

export function registerRichText(editor: LexicalEditor): () => void {
  const removeListener = mergeRegister(
    editor.registerCommand(
      CLICK_COMMAND,
      (payload) => {
        const selection = $getSelection();
        if ($isNodeSelection(selection)) {
          selection.clear();
          return true;
        }
        return false;
      },
      0,
    ),
    editor.registerCommand<boolean>(
      DELETE_CHARACTER_COMMAND,
      (isBackward) => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.deleteCharacter(isBackward);
          return true;
        } else if ($isNodeSelection(selection)) {
          selection.deleteNodes();
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand<boolean>(
      DELETE_WORD_COMMAND,
      (isBackward) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return false;
        }
        selection.deleteWord(isBackward);
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand<boolean>(
      DELETE_LINE_COMMAND,
      (isBackward) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return false;
        }
        selection.deleteLine(isBackward);
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand(
      CONTROLLED_TEXT_INSERTION_COMMAND,
      (eventOrText) => {
        const selection = $getSelection();

        if (typeof eventOrText === 'string') {
          if (selection !== null) {
            selection.insertText(eventOrText);
          }
        } else {
          if (selection === null) {
            return false;
          }

          const dataTransfer = eventOrText.dataTransfer;
          if (dataTransfer != null) {
            $insertDataTransferForRichText(dataTransfer, selection, editor);
          } else if ($isRangeSelection(selection)) {
            const data = eventOrText.data;
            if (data) {
              selection.insertText(data);
            }
            return true;
          }
        }
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand(
      REMOVE_TEXT_COMMAND,
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return false;
        }
        selection.removeText();
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand<TextFormatType>(
      FORMAT_TEXT_COMMAND,
      (format) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return false;
        }
        selection.formatText(format);
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand<ElementFormatType>(
      FORMAT_ELEMENT_COMMAND,
      (format) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) && !$isNodeSelection(selection)) {
          return false;
        }
        const nodes = selection.getNodes();
        for (const node of nodes) {
          const element = $findMatchingParent(
            node,
            (parentNode): parentNode is ElementNode =>
              $isElementNode(parentNode) && !parentNode.isInline(),
          );
          if (element !== null) {
            element.setFormat(format);
          }
        }
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand<boolean>(
      INSERT_LINE_BREAK_COMMAND,
      (selectStart) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return false;
        }
        selection.insertLineBreak(selectStart);
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand(
      INSERT_PARAGRAPH_COMMAND,
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return false;
        }
        selection.insertParagraph();
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand(
      INSERT_TAB_COMMAND,
      () => {
        $insertNodes([$createTabNode()]);
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand(
      INDENT_CONTENT_COMMAND,
      () => {
        return $handleIndentAndOutdent((block) => {
          const indent = block.getIndent();
          block.setIndent(indent + 1);
        });
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand(
      OUTDENT_CONTENT_COMMAND,
      () => {
        return $handleIndentAndOutdent((block) => {
          const indent = block.getIndent();
          if (indent > 0) {
            block.setIndent(Math.max(0, indent - 1));
          }
        });
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand<KeyboardEvent>(
      KEY_ARROW_UP_COMMAND,
      (event) => {
        const selection = $getSelection();
        if ($isNodeSelection(selection)) {
          // If selection is on a node, let's try and move selection
          // back to being a range selection.
          const nodes = selection.getNodes();
          if (nodes.length > 0) {
            nodes[0].selectPrevious();
            return true;
          }
        } else if ($isRangeSelection(selection)) {
          const possibleNode = $getAdjacentNode(selection.focus, true);
          if (
            !event.shiftKey &&
            $isDecoratorNode(possibleNode) &&
            !possibleNode.isIsolated() &&
            !possibleNode.isInline()
          ) {
            possibleNode.selectPrevious();
            event.preventDefault();
            return true;
          }
        }
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand<KeyboardEvent>(
      KEY_ARROW_DOWN_COMMAND,
      (event) => {
        const selection = $getSelection();
        if ($isNodeSelection(selection)) {
          // If selection is on a node, let's try and move selection
          // back to being a range selection.
          const nodes = selection.getNodes();
          if (nodes.length > 0) {
            nodes[0].selectNext(0, 0);
            return true;
          }
        } else if ($isRangeSelection(selection)) {
          if ($isSelectionAtEndOfRoot(selection)) {
            event.preventDefault();
            return true;
          }
          const possibleNode = $getAdjacentNode(selection.focus, false);
          if (
            !event.shiftKey &&
            $isDecoratorNode(possibleNode) &&
            !possibleNode.isIsolated() &&
            !possibleNode.isInline()
          ) {
            possibleNode.selectNext();
            event.preventDefault();
            return true;
          }
        }
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand<KeyboardEvent>(
      KEY_ARROW_LEFT_COMMAND,
      (event) => {
        const selection = $getSelection();
        if ($isNodeSelection(selection)) {
          // If selection is on a node, let's try and move selection
          // back to being a range selection.
          const nodes = selection.getNodes();
          if (nodes.length > 0) {
            event.preventDefault();
            nodes[0].selectPrevious();
            return true;
          }
        }
        if (!$isRangeSelection(selection)) {
          return false;
        }
        if ($shouldOverrideDefaultCharacterSelection(selection, true)) {
          const isHoldingShift = event.shiftKey;
          event.preventDefault();
          $moveCharacter(selection, isHoldingShift, true);
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand<KeyboardEvent>(
      KEY_ARROW_RIGHT_COMMAND,
      (event) => {
        const selection = $getSelection();
        if ($isNodeSelection(selection)) {
          // If selection is on a node, let's try and move selection
          // back to being a range selection.
          const nodes = selection.getNodes();
          if (nodes.length > 0) {
            event.preventDefault();
            nodes[0].selectNext(0, 0);
            return true;
          }
        }
        if (!$isRangeSelection(selection)) {
          return false;
        }
        const isHoldingShift = event.shiftKey;
        if ($shouldOverrideDefaultCharacterSelection(selection, false)) {
          event.preventDefault();
          $moveCharacter(selection, isHoldingShift, false);
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand<KeyboardEvent>(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        if ($isTargetWithinDecorator(event.target as HTMLElement)) {
          return false;
        }
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          if ($isSelectionCollapsedAtFrontOfIndentedBlock(selection)) {
            event.preventDefault();
            return editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
          }
          // Exception handling for iOS native behavior instead of Lexical's behavior when using Korean on iOS devices.
          // more details - https://github.com/facebook/lexical/issues/5841
          if (IS_IOS && navigator.language === 'ko-KR') {
            return false;
          }
        } else if (!$isNodeSelection(selection)) {
          return false;
        }
        event.preventDefault();

        return editor.dispatchCommand(DELETE_CHARACTER_COMMAND, true);
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand<KeyboardEvent>(
      KEY_DELETE_COMMAND,
      (event) => {
        if ($isTargetWithinDecorator(event.target as HTMLElement)) {
          return false;
        }
        const selection = $getSelection();
        if (!($isRangeSelection(selection) || $isNodeSelection(selection))) {
          return false;
        }
        event.preventDefault();
        return editor.dispatchCommand(DELETE_CHARACTER_COMMAND, false);
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand<KeyboardEvent | null>(
      KEY_ENTER_COMMAND,
      (event) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return false;
        }

        $resetCapitalization(selection);

        if (event !== null) {
          // If we have beforeinput, then we can avoid blocking
          // the default behavior. This ensures that the iOS can
          // intercept that we're actually inserting a paragraph,
          // and autocomplete, autocapitalize etc work as intended.
          // This can also cause a strange performance issue in
          // Safari, where there is a noticeable pause due to
          // preventing the key down of enter.
          if (
            (IS_IOS || IS_SAFARI || IS_APPLE_WEBKIT) &&
            CAN_USE_BEFORE_INPUT
          ) {
            return false;
          }
          event.preventDefault();
          if (event.shiftKey) {
            return editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false);
          }
        }
        return editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return false;
        }
        editor.blur();
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand<DragEvent>(
      DROP_COMMAND,
      (event) => {
        const [, files] = eventFiles(event);
        if (files.length > 0) {
          const x = event.clientX;
          const y = event.clientY;
          const eventRange = caretFromPoint(x, y);
          if (eventRange !== null) {
            const {offset: domOffset, node: domNode} = eventRange;
            const node = $getNearestNodeFromDOMNode(domNode);
            if (node !== null) {
              const selection = $createRangeSelection();
              if ($isTextNode(node)) {
                selection.anchor.set(node.getKey(), domOffset, 'text');
                selection.focus.set(node.getKey(), domOffset, 'text');
              } else {
                const parentKey = node.getParentOrThrow().getKey();
                const offset = node.getIndexWithinParent() + 1;
                selection.anchor.set(parentKey, offset, 'element');
                selection.focus.set(parentKey, offset, 'element');
              }
              const normalizedSelection =
                $normalizeSelection__EXPERIMENTAL(selection);
              $setSelection(normalizedSelection);
            }
            editor.dispatchCommand(DRAG_DROP_PASTE, files);
          }
          event.preventDefault();
          return true;
        }

        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand<DragEvent>(
      DRAGSTART_COMMAND,
      (event) => {
        const [isFileTransfer] = eventFiles(event);
        const selection = $getSelection();
        if (isFileTransfer && !$isRangeSelection(selection)) {
          return false;
        }
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand<DragEvent>(
      DRAGOVER_COMMAND,
      (event) => {
        const [isFileTransfer] = eventFiles(event);
        const selection = $getSelection();
        if (isFileTransfer && !$isRangeSelection(selection)) {
          return false;
        }
        const x = event.clientX;
        const y = event.clientY;
        const eventRange = caretFromPoint(x, y);
        if (eventRange !== null) {
          const node = $getNearestNodeFromDOMNode(eventRange.node);
          if ($isDecoratorNode(node)) {
            // Show browser caret as the user is dragging the media across the screen. Won't work
            // for DecoratorNode nor it's relevant.
            event.preventDefault();
          }
        }
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand(
      SELECT_ALL_COMMAND,
      () => {
        $selectAll();

        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand(
      COPY_COMMAND,
      (event) => {
        copyToClipboard(
          editor,
          objectKlassEquals(event, ClipboardEvent) ? event : null,
        );
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand(
      CUT_COMMAND,
      (event) => {
        onCutForRichText(event, editor);
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        const [, files, hasTextContent] = eventFiles(event);
        if (files.length > 0 && !hasTextContent) {
          editor.dispatchCommand(DRAG_DROP_PASTE, files);
          return true;
        }

        // if inputs then paste within the input ignore creating a new node on paste event
        if (
          isDOMNode(event.target) &&
          isSelectionCapturedInDecoratorInput(event.target)
        ) {
          return false;
        }

        const selection = $getSelection();
        if (selection !== null) {
          onPasteForRichText(event, editor);
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand(
      KEY_SPACE_COMMAND,
      (_) => {
        const selection = $getSelection();

        if ($isRangeSelection(selection)) {
          $resetCapitalization(selection);
        }

        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand(
      KEY_TAB_COMMAND,
      (_) => {
        const selection = $getSelection();

        if ($isRangeSelection(selection)) {
          $resetCapitalization(selection);
        }

        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
  );
  return removeListener;
}
