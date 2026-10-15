import { SYSTEM_DARK, SYSTEM_LIGHT, UI_THEMES, type UiTheme, type UiThemeChoice, type UiThemeId } from './appearance';
import { DropdownMenu } from './DropdownMenu';
import { Icon } from './icons';
import { N_, UI_LANGUAGES, setUiLanguage, t, uiLanguage } from '../i18n/ui';

const nameOf = (id: UiThemeId) => t(UI_THEMES.find((theme) => theme.id === id)!.name);
const GROUPS = [N_('Light'), N_('Dark')];
function Swatch({ theme }: { theme: UiTheme }) {
  return <span className="swatch" aria-hidden="true">{theme.swatch.map((color, index) => <span key={index} style={{ background: color }} />)}</span>;
}

export function AppearanceMenu({ choice, resolved, onChoose }: { choice: UiThemeChoice; resolved: UiThemeId; onChoose: (choice: UiThemeChoice) => void }) {
  const dark = UI_THEMES.find((theme) => theme.id === resolved)?.dark;
  return <DropdownMenu label={t('Appearance: {theme}', { theme: choice === 'system' ? t('System ({theme})', { theme: nameOf(resolved) }) : nameOf(resolved) })} className="btn btn-quiet btn-icon-only" align="right" button={<Icon name={dark ? 'moon' : 'sun'} />}>
    {(close) => <>
      <div className="menu-label">{t('App appearance')}</div>
      <button type="button" role="menuitemradio" aria-checked={choice === 'system'} className="theme-option" onClick={() => { close(); onChoose('system'); }}>
        <span className="swatch swatch-system" aria-hidden="true"><span /><span /><span /></span>
        <span className="theme-option-name">{t('System')}<small className="theme-note">{t('{light} or {dark}', { light: nameOf(SYSTEM_LIGHT), dark: nameOf(SYSTEM_DARK) })}</small></span>
        <span className="theme-check"><Icon name="check" size={15} /></span>
      </button>
      {GROUPS.map((group) => <div key={group}>
        <div className="menu-sep" /><div className="menu-label">{t(group)}</div>
        {UI_THEMES.filter((theme) => theme.dark === (group === 'Dark')).map((theme) =>
          <button key={theme.id} type="button" role="menuitemradio" aria-checked={choice === theme.id} className="theme-option" onClick={() => { close(); onChoose(theme.id); }}>
            <Swatch theme={theme} /><span className="theme-option-name">{t(theme.name)}</span><span className="theme-check"><Icon name="check" size={15} /></span>
          </button>,
        )}
      </div>)}
      <div className="menu-sep" /><div className="menu-label">{t('Interface language')}</div>
      {UI_LANGUAGES.map((language) =>
        <button key={language.code} type="button" role="menuitemradio" aria-checked={uiLanguage() === language.code} className="theme-option" lang={language.code} onClick={() => { close(); if (language.code !== uiLanguage()) setUiLanguage(language.code); }}>
          <span className="swatch swatch-language" aria-hidden="true">{language.code.toUpperCase()}</span><span className="theme-option-name">{language.name}</span><span className="theme-check"><Icon name="check" size={15} /></span>
        </button>,
      )}
    </>}
  </DropdownMenu>;
}
