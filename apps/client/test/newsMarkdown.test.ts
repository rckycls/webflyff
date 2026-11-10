import { expect, it } from 'vitest';
import { renderMarkdown } from '../src/site/newsMarkdown';

it('escapes HTML and drops script links', () => {
  expect(renderMarkdown('<b>x</b> & "y"')).toBe('<p>&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;</p>');
  expect(renderMarkdown("it's")).toBe('<p>it&#39;s</p>');
  expect(renderMarkdown('[go](javascript:alert(1))')).toBe('<p>go</p>');
  expect(renderMarkdown('[site](https://a.b/c)')).toBe('<p><a href="https://a.b/c" rel="noopener noreferrer">site</a></p>');
});
it('keeps a quote in a link from leaving the attribute', () => {
  expect(renderMarkdown('[x](https://a.b/"onmouseover="alert(1))')).not.toContain('" onmouseover');
  expect(renderMarkdown('[x](https://a.b/"onmouseover="alert(1))')).toContain('href="https://a.b/&quot;onmouseover=&quot;alert(1)"');
});
it('renders paragraphs, lists and emphasis', () => {
  expect(renderMarkdown('**a** *b*\n\n- one\n- two')).toBe('<p><strong>a</strong> <em>b</em></p><ul><li>one</li><li>two</li></ul>');
});
it('joins the lines of a paragraph and reads Windows line ends', () => {
  expect(renderMarkdown('one\r\ntwo\r\n\r\nthree')).toBe('<p>one two</p><p>three</p>');
});
