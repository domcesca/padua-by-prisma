// A template re-mounts on every navigation, giving each tab a calm fade-in.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>
}
