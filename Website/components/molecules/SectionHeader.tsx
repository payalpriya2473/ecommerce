type SectionHeaderProps = {
  iconClass: string;
  iconColorClass: string;
  title: string;
  subtitle: string;
  actionText?: string;
  actionHref?: string;
};

export function SectionHeader({
  iconClass,
  iconColorClass,
  title,
  subtitle,
  actionText,
  actionHref = "#",
}: SectionHeaderProps) {
  return (
    <div className="section-header">
      <div className="section-header-left">
        <div className={`section-icon ${iconColorClass}`}>
          <i className={`fas ${iconClass}`} />
        </div>
        <div>
          <h2 className="section-title">{title}</h2>
          <p className="section-subtitle">{subtitle}</p>
        </div>
      </div>
      {actionText ? (
        <a href={actionHref} className="view-all">
          {actionText} <i className="fas fa-arrow-right" />
        </a>
      ) : null}
    </div>
  );
}