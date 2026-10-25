import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Markdown({ children, className = '' }) {
  return (
    <div
      className={`prose prose-invert prose-sm max-w-none prose-headings:text-slate-100 prose-a:text-emerald-400 prose-code:rounded prose-code:bg-slate-800 prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none prose-pre:bg-slate-950 prose-pre:ring-1 prose-pre:ring-slate-800 prose-th:text-slate-300 ${className}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>
        {children || ''}
      </ReactMarkdown>
    </div>
  );
}
