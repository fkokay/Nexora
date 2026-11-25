import { roleLabel, type StudioMenuRole } from "./studioNav";

const order: StudioMenuRole[] = ["consultant", "developer", "admin"];

type Props = {
  held: StudioMenuRole[];
  active: StudioMenuRole;
  onChange: (role: StudioMenuRole) => void;
};

/** Kenar çubuğunun üstündeki rol düğmesi. Tek rolü olan kişiye hiçbir şey çizmez. */
export function RoleSwitcher({ held, active, onChange }: Props) {
  if (held.length < 2) return null;
  return (
    <div className="st-segmented st-role-switch" role="group" aria-label="Studio rolü">
      {order
        .filter((role) => held.includes(role))
        .map((role) => (
          <button key={role} type="button" aria-pressed={role === active} onClick={() => onChange(role)}>
            {roleLabel(role)}
          </button>
        ))}
    </div>
  );
}
