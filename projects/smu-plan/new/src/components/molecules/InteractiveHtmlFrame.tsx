interface InteractiveHtmlFrameProps {
  html: string;
  title: string;
  className?: string;
}

export default function InteractiveHtmlFrame({
  html,
  title,
  className,
}: InteractiveHtmlFrameProps) {
  return (
    <iframe
      className={className}
      title={title}
      srcDoc={html}
      loading="lazy"
      referrerPolicy="no-referrer"
      sandbox="allow-scripts allow-modals allow-pointer-lock allow-popups"
    />
  );
}
