import { renderText } from '@/lib/utils';

interface RichTextProps {
  text: string;
  onMentionClick?: (username: string) => void;
  onHashtagClick?: (hashtag: string) => void;
  className?: string;
}

export default function RichText({ text, onMentionClick, onHashtagClick, className }: RichTextProps) {
  const parts = renderText(text);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.type === 'mention') {
          return (
            <span
              key={i}
              className="text-sky-600 font-medium hover:underline cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onMentionClick?.(part.value.slice(1));
              }}
            >
              {part.value}
            </span>
          );
        }
        if (part.type === 'hashtag') {
          return (
            <span
              key={i}
              className="text-blue-600 font-medium hover:underline cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onHashtagClick?.(part.value.slice(1));
              }}
            >
              {part.value}
            </span>
          );
        }
        if (part.type === 'url') {
          return (
            <a
              key={i}
              href={part.value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-600 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {part.value}
            </a>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </span>
  );
}
