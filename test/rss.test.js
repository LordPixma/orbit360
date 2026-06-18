import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRss, decode, hash } from '../src/rss.js';

const SAMPLE = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>Falcon 9 lofts Starlink &amp; more</title>
    <link>https://example.com/a</link>
    <pubDate>Wed, 17 Jun 2026 09:00:00 GMT</pubDate>
    <description><![CDATA[Some <b>bold</b> summary]]></description>
    <source url="https://example.com">Example Wire</source>
  </item>
  <item>
    <title>Second item</title>
    <link>https://example.com/b</link>
  </item>
</channel></rss>`;

test('parseRss: extracts every <item> and its fields', () => {
  const items = parseRss(SAMPLE);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Falcon 9 lofts Starlink & more');
  assert.equal(items[0].link, 'https://example.com/a');
  assert.equal(items[0].pubDate, 'Wed, 17 Jun 2026 09:00:00 GMT');
  assert.equal(items[0].description, 'Some <b>bold</b> summary'); // CDATA unwrapped
  assert.equal(items[0].sourceName, 'Example Wire');
});

test('parseRss: missing fields come back as null, not undefined', () => {
  const [, second] = parseRss(SAMPLE);
  assert.equal(second.title, 'Second item');
  assert.equal(second.pubDate, null);
  assert.equal(second.description, null);
  assert.equal(second.sourceName, null);
});

test('parseRss: no items -> empty array', () => {
  assert.deepEqual(parseRss('<rss><channel></channel></rss>'), []);
});

test('decode: resolves the common XML/HTML entities', () => {
  assert.equal(
    decode('a &amp; b &lt;c&gt; &#39;d&#39; &quot;e&quot; &#65;'),
    `a & b <c> 'd' "e" A`
  );
  assert.equal(decode(null), '');
});

test('hash: stable, string-valued, and sensitive to input', () => {
  assert.equal(typeof hash('hello'), 'string');
  assert.equal(hash('hello'), hash('hello'));
  assert.notEqual(hash('hello'), hash('hellp'));
  assert.equal(hash(null), hash('')); // both normalise to ''
});
