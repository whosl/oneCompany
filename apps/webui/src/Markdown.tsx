import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`markdown-body ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children: label, href, title }) => <a href={href} title={title} target="_blank" rel="noreferrer">{label}</a>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
