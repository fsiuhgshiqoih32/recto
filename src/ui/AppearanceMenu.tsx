import { SYSTEM_DARK, SYSTEM_LIGHT, UI_THEMES, type UiTheme, type UiThemeChoice, type UiThemeId } from './appearance';
import { DropdownMenu } from './DropdownMenu';
import { Icon } from './icons';

const nameOf = (id: UiThemeId) => UI_THEMES.find((theme) => theme.id === id)!.name;
function Swatch({ theme }: { theme: UiTheme }) {
  return <span className="swatch" aria-hidden="true">{theme.swatch.map((color, index) => <span key={index} style={{ background: color }} />)}</span>;
}

export function AppearanceMenu({ choice, resolved, onChoose }: { choice: UiThemeChoice; resolved: UiThemeId; onChoose: (choice: UiThemeChoice) => void }) {
  const dark = UI_THEMES.find((theme) => theme.id === resolved)?.dark;
  return <DropdownMenu label={`Appearance: ${choice === 'system' ? `System (${nameOf(resolved)})` : nameOf(resolved)}`} className="btn btn-quiet btn-icon-only" align="right" button={<Icon name={dark ? 'moon' : 'sun'} />}>
    {(close) => <>
      <div className="menu-label">App appearance</div>
      <button type="button" role="menuitemradio" aria-checked={choice === 'system'} className="theme-option" onClick={() => { close(); onChoose('system'); }}>
        <span className="swatch swatch-system" aria-hidden="true"><span /><span /><span /></span>
        <span className="theme-option-name">System<small className="theme-note">{nameOf(SYSTEM_LIGHT)} or {nameOf(SYSTEM_DARK)}</small></span>
        <span className="theme-check"><Icon name="check" size={15} /></span>
      </button>
      {['Light', 'Dark'].map((group) => <div key={group}>
        <div className="menu-sep" /><div className="menu-label">{group}</div>
        {UI_THEMES.filter((theme) => theme.dark === (group === 'Dark')).map((theme) =>
          <button key={theme.id} type="button" role="menuitemradio" aria-checked={choice === theme.id} className="theme-option" onClick={() => { close(); onChoose(theme.id); }}>
            <Swatch theme={theme} /><span className="theme-option-name">{theme.name}</span><span className="theme-check"><Icon name="check" size={15} /></span>
          </button>,
        )}
      </div>)}
    </>}
  </DropdownMenu>;
}
