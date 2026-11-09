import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readSource(file: string): string {
  return readFileSync(join(process.cwd(), 'src', file), 'utf8');
}

describe('Global typography', () => {
  it('configures Poppins for Material and application typography', () => {
    const styles = readSource('styles.scss');

    expect(styles).toContain("'Poppins'");
    expect(styles).toContain('plain-family');
    expect(styles).toContain('brand-family');
    expect(styles).toContain('regular-weight: 400');
    expect(styles).toContain('medium-weight: 500');
    expect(styles).toContain('bold-weight: 700');
    expect(styles).toContain('--app-font-family');
  });

  it('loads Poppins weights 400, 500, 600, and 700', () => {
    const indexHtml = readSource('index.html');

    expect(indexHtml).toContain('fonts.googleapis.com');
    expect(indexHtml).toContain('family=Poppins');
    expect(indexHtml).toContain('wght@400;500;600;700');
  });
});
