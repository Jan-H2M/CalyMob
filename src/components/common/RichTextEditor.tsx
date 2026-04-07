import React, { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Unlink,
  Undo,
  Redo,
  Palette,
  Highlighter,
  ChevronDown,
} from 'lucide-react';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  compact?: boolean;  // Smaller toolbar for inline editing in editable zones
}

// Predefined colors for text and highlight
const TEXT_COLORS = [
  { name: 'Noir', color: '#000000' },
  { name: 'Gris foncé', color: '#4B5563' },
  { name: 'Gris', color: '#9CA3AF' },
  { name: 'Rouge', color: '#DC2626' },
  { name: 'Orange', color: '#EA580C' },
  { name: 'Jaune', color: '#CA8A04' },
  { name: 'Vert', color: '#16A34A' },
  { name: 'Bleu', color: '#2563EB' },
  { name: 'Indigo', color: '#4F46E5' },
  { name: 'Violet', color: '#9333EA' },
  { name: 'Rose', color: '#DB2777' },
  { name: 'Calypso Blue', color: '#0ea5e9' },
];

const HIGHLIGHT_COLORS = [
  { name: 'Aucun', color: '' },
  { name: 'Jaune', color: '#FEF08A' },
  { name: 'Vert', color: '#BBF7D0' },
  { name: 'Bleu', color: '#BFDBFE' },
  { name: 'Rose', color: '#FBCFE8' },
  { name: 'Orange', color: '#FED7AA' },
  { name: 'Violet', color: '#DDD6FE' },
  { name: 'Rouge', color: '#FECACA' },
  { name: 'Cyan', color: '#A5F3FC' },
];

export function RichTextEditor({
  content,
  onChange,
  placeholder = 'Commencez à écrire...',
  className = '',
  compact = false,
}: RichTextEditorProps) {
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const textColorRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (textColorRef.current && !textColorRef.current.contains(event.target as Node)) {
        setShowTextColorPicker(false);
      }
      if (highlightRef.current && !highlightRef.current.contains(event.target as Node)) {
        setShowHighlightPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, // Email doesn't need headings
      }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-calypso-blue underline',
        },
      }),
      TextAlign.configure({
        types: ['paragraph'],
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none ${compact ? 'min-h-[80px] p-2' : 'min-h-[200px] p-4'} dark:prose-invert`,
      },
    },
  });

  // Update editor content when content prop changes from outside (e.g., template selection)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  if (!editor) {
    return null;
  }

  const addLink = () => {
    const url = window.prompt('URL du lien:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const setTextColor = (color: string) => {
    editor.chain().focus().setColor(color).run();
    setShowTextColorPicker(false);
  };

  const setHighlightColor = (color: string) => {
    if (color === '') {
      editor.chain().focus().unsetHighlight().run();
    } else {
      editor.chain().focus().toggleHighlight({ color }).run();
    }
    setShowHighlightPicker(false);
  };

  // Get current text color
  const currentTextColor = editor.getAttributes('textStyle').color || '#000000';

  const ToolbarButton = ({
    onClick,
    isActive = false,
    disabled = false,
    children,
    title,
  }: {
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-2 rounded transition-colors ${
        isActive
          ? 'bg-calypso-blue text-white'
          : 'text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );

  const ColorPicker = ({
    colors,
    onSelect,
    currentColor,
  }: {
    colors: { name: string; color: string }[];
    onSelect: (color: string) => void;
    currentColor?: string;
  }) => (
    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg shadow-lg p-2 z-50 min-w-[180px]">
      <div className="grid grid-cols-4 gap-1">
        {colors.map((c) => (
          <button
            key={c.color || 'none'}
            type="button"
            onClick={() => onSelect(c.color)}
            title={c.name}
            className={`w-8 h-8 rounded border-2 transition-all hover:scale-110 ${
              currentColor === c.color
                ? 'border-calypso-blue ring-2 ring-calypso-blue/30'
                : 'border-gray-200 dark:border-dark-border'
            } ${c.color === '' ? 'bg-white dark:bg-dark-bg-tertiary relative overflow-hidden' : ''}`}
            style={{ backgroundColor: c.color || undefined }}
          >
            {c.color === '' && (
              <span className="absolute inset-0 flex items-center justify-center text-gray-400 dark:text-dark-text-muted text-xs">
                ∅
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );

  // Compact toolbar for inline editing (only essential buttons)
  const CompactToolbar = () => (
    <div className="flex items-center gap-0.5 p-1 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="Gras"
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="Italique"
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        title="Souligné"
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
      <div className="w-px h-4 bg-gray-300 dark:bg-dark-border mx-0.5" />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title="Liste"
      >
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={addLink}
        isActive={editor.isActive('link')}
        title="Lien"
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
    </div>
  );

  // Full toolbar with all options
  const FullToolbar = () => (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
      {/* Text formatting */}
      <div className="flex items-center gap-0.5 mr-2">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="Gras (Ctrl+B)"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="Italique (Ctrl+I)"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive('underline')}
          title="Souligné (Ctrl+U)"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
          title="Barré"
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-gray-300 dark:bg-dark-border mx-1" />

      {/* Color controls */}
      <div className="flex items-center gap-0.5 mr-2">
        {/* Text color */}
        <div className="relative" ref={textColorRef}>
          <button
            type="button"
            onClick={() => {
              setShowTextColorPicker(!showTextColorPicker);
              setShowHighlightPicker(false);
            }}
            title="Couleur du texte"
            className="p-2 rounded transition-colors text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary flex items-center gap-0.5"
          >
            <Palette className="h-4 w-4" />
            <div
              className="w-3 h-1 rounded-sm"
              style={{ backgroundColor: currentTextColor }}
            />
            <ChevronDown className="h-3 w-3" />
          </button>
          {showTextColorPicker && (
            <ColorPicker
              colors={TEXT_COLORS}
              onSelect={setTextColor}
              currentColor={currentTextColor}
            />
          )}
        </div>

        {/* Highlight color */}
        <div className="relative" ref={highlightRef}>
          <button
            type="button"
            onClick={() => {
              setShowHighlightPicker(!showHighlightPicker);
              setShowTextColorPicker(false);
            }}
            title="Surligner"
            className={`p-2 rounded transition-colors flex items-center gap-0.5 ${
              editor.isActive('highlight')
                ? 'bg-calypso-blue text-white'
                : 'text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary'
            }`}
          >
            <Highlighter className="h-4 w-4" />
            <ChevronDown className="h-3 w-3" />
          </button>
          {showHighlightPicker && (
            <ColorPicker
              colors={HIGHLIGHT_COLORS}
              onSelect={setHighlightColor}
              currentColor={editor.getAttributes('highlight').color || ''}
            />
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-gray-300 dark:bg-dark-border mx-1" />

      {/* Lists */}
      <div className="flex items-center gap-0.5 mr-2">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="Liste à puces"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title="Liste numérotée"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-gray-300 dark:bg-dark-border mx-1" />

      {/* Alignment */}
      <div className="flex items-center gap-0.5 mr-2">
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          isActive={editor.isActive({ textAlign: 'left' })}
          title="Aligner à gauche"
        >
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          isActive={editor.isActive({ textAlign: 'center' })}
          title="Centrer"
        >
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          isActive={editor.isActive({ textAlign: 'right' })}
          title="Aligner à droite"
        >
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-gray-300 dark:bg-dark-border mx-1" />

      {/* Links */}
      <div className="flex items-center gap-0.5 mr-2">
        <ToolbarButton
          onClick={addLink}
          isActive={editor.isActive('link')}
          title="Ajouter un lien"
        >
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().unsetLink().run()}
          disabled={!editor.isActive('link')}
          title="Supprimer le lien"
        >
          <Unlink className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-gray-300 dark:bg-dark-border mx-1" />

      {/* Undo/Redo */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Annuler (Ctrl+Z)"
        >
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Rétablir (Ctrl+Y)"
        >
          <Redo className="h-4 w-4" />
        </ToolbarButton>
      </div>
    </div>
  );

  return (
    <div className={`border border-gray-300 dark:border-dark-border rounded-lg overflow-hidden ${className}`}>
      {/* Toolbar - compact or full */}
      {compact ? <CompactToolbar /> : <FullToolbar />}

      {/* Editor content */}
      <div className="bg-white dark:bg-dark-bg-secondary tiptap-editor">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
