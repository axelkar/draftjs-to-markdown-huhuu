import {isEmptyString, forEach, isList} from './common.ts';

export interface Range {
	offset: number;
	length: number;
}

export type EntityId = number;

export interface EntityRange extends Range {
	key: EntityId;
}
export interface InlineStyleRange extends Range {
	style: string;
}

export interface Block {
	key: string;
	text: string;
	type: BlockType;
	depth: number;
	entityRanges: EntityRange[];
	inlineStyleRanges: InlineStyleRange[];
	data?: Record<string, unknown> | null;
}

export type CoreBlockType =
	| 'header-one'
	| 'header-two'
	| 'header-three'
	| 'header-four'
	| 'header-five'
	| 'header-six'
	| 'section'
	| 'article'
	| 'unordered-list-item'
	| 'ordered-list-item'
	| 'blockquote'
	| 'atomic'
	| 'code-block'
	| 'unstyled';

export type CustomBlockType = string;

export type BlockType = CoreBlockType | CustomBlockType;

export interface EditorContent {
	blocks: Block[];
	entityMap: Record<string, Entity>;
	[x: string]: unknown;
}

export interface Entity<T = Record<string, unknown>> {
	type: string;
	mutability: 'MUTABLE' | 'IMMUTABLE' | 'SEGMENTED' | string;
	data: T;
}

export interface HashConfig {
	trigger: string;
	separator: string;
}

export interface PreSection {
	offset: number;
	length: number;
	key?: number;
	type: 'ENTITY' | 'HASHTAG';
}

export interface Section {
	start: number; // PreSection.offset
	end: number; // PreSection.offset + PreSection.length
	entityKey?: number; // PreSection.key
	type?: 'ENTITY' | 'HASHTAG';
}

export type EntityMap = Record<string, Entity>;


export const BOOLEAN_INLINE_STYLE_NAMES = ['SUBSCRIPT', 'SUPERSCRIPT', 'CODE', 'STRIKETHROUGH', 'UNDERLINE', 'ITALIC', 'BOLD', 'BLOCKQUOTE', 'CODE-BLOCK'] as const;
export const STRING_INLINE_STYLE_NAMES = ['COLOR', 'BGCOLOR', 'FONTSIZE', 'FONTFAMILY', 'RAWCSS'] as const;
export const INLINE_STYLE_NAMES: InlineStyleNames[] = [...BOOLEAN_INLINE_STYLE_NAMES, ...STRING_INLINE_STYLE_NAMES];
//type BooleanInlineStyleNames = 'SUBSCRIPT' | 'SUPERSCRIPT' | 'CODE' | 'STRIKETHROUGH' | 'UNDERLINE' | 'ITALIC' | 'BOLD' | 'BLOCKQUOTE' | 'CODE-BLOCK';
//type StringInlineStyleNames = 'COLOR' | 'BGCOLOR' | 'FONTSIZE' | 'FONTFAMILY' | 'RAWCSS';
export type BooleanInlineStyleNames = typeof BOOLEAN_INLINE_STYLE_NAMES[number];
export type StringInlineStyleNames = typeof STRING_INLINE_STYLE_NAMES[number];
export type InlineStyleNames = BooleanInlineStyleNames | StringInlineStyleNames;
//export type SingleInlineStyles = Partial<Record<BooleanInlineStyleNames, boolean> & Record<StringInlineStyleNames, string>>
export type SingleInlineStyles = Partial<Record<BooleanInlineStyleNames, boolean>> & Partial<Record<StringInlineStyleNames, string>>
export type InlineStyles = Record<BooleanInlineStyleNames, boolean[]> & Record<StringInlineStyleNames, string[]> & {
	length: number;
}

// assert StyleTransformKey in InlineStyleNames
export type StyleTransformKey = 'BOLD' | 'ITALIC' | 'UNDERLINE' | 'STRIKETHROUGH' | 'CODE' | 'CODE-BLOCK' | 'BLOCKQUOTE' | 'SUPERSCRIPT' | 'SUBSCRIPT' | string;
export type StyleTransform = Record<StyleTransformKey, string | [string, string]>;
export type CustomStyleTransform = Partial<StyleTransform>;

type _HeaderSizes = 'one' | 'two' | 'three' | 'four' | 'five' | 'six';
export type BlockTypesMapping = Record<'unstyled' | `header-${_HeaderSizes}` | `${'un' | ''}unordered-list-item` | string, string>;

export type StyleSection = {
	styles: SingleInlineStyles;
	text: string[];
	start: number;
	end: number;
	// assert start > end
};

export type CustomEntityTransform = (entity: Entity, text: string) => (string | undefined);

export type Config = Partial<{
	customStyleTransform: CustomStyleTransform;
	emptyLineBeforeBlock: boolean;
	printBreakLineLiteral: boolean;
	blockTypesMapping: Partial<BlockTypesMapping>;
	rawCssInlineStyles: boolean;
}>

/**
 * Mapping block-type to corresponding markdown symbol.
 */
const defaultBlockTypesMapping: BlockTypesMapping = {
	unstyled: '',
	'header-one': '# ',
	'header-two': '## ',
	'header-three': '### ',
	'header-four': '#### ',
	'header-five': '##### ',
	'header-six': '###### ',
	'unordered-list-item': '- ',
	'ordered-list-item': '1. ',
	blockquote: '> ',
	code: '    ',
};

/**
 * Function to check if the block is an atomic entity block.
 */
function isAtomicBlock(block: Block): boolean {
	// if (block.type === 'atomic' || (block.entityRanges.length > 0 && isEmptyString(block.text))) {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-call
	if (block.entityRanges.length > 0 && isEmptyString(block.text)) {
		return true;
	}
	return false;
}

/**
 * Function will return markdown for Entity.
 * The generic means that if it inputs undefined in text it can output undefined too.
 */
function getEntityMarkdown(entity: Entity, text: string, customEntityTransform: CustomEntityTransform): string {
	if (typeof customEntityTransform === 'function') {
		const html = customEntityTransform(entity, text);
		if (typeof html !== 'undefined') {
			return html;
		}
	}
	switch (entity.type) {
		case 'LINK':
		case 'MENTION':
			return `[${text}](${entity.data.url as string})`;
		case 'IMAGE':
			return `![${entity.data.alt as string || ''}](${entity.data.src as string})`;
		case 'EMBEDDED_LINK':
			return `<iframe width="${entity.data.width as number}" height="${
				entity.data.height as number
			}" src="${entity.data.src as string}" frameBorder="0" allowFullScreen />`;
		default:
			return text;
	}
}

/**
 * The function returns an array of hashtag-sections in blocks.
 * These will be areas in block which have hashtags applicable to them.
 */
function getHashtagRanges(text: string, hashConfig: HashConfig): PreSection[] {
	const preSections: PreSection[] = [];
	let counter = 0;
	let startIndex = 0;
	const { trigger, separator } = hashConfig;
	for (; text.length > 0 && startIndex >= 0;) {
		if (text.startsWith(trigger)) {
			// If the working buffer starts with a hashConfig.trigger (default '#')
			startIndex = 0;
			counter = 0;
			text = text.substr(trigger.length);
		} else {
			startIndex = text.indexOf(separator + trigger);
			if (startIndex >= 0) {
				text = text.substr(startIndex + (separator + trigger).length);
				counter += startIndex + separator.length;
			}
		}
		if (startIndex >= 0) {
			const endIndex =
				text.indexOf(separator) >= 0 ? text.indexOf(separator) : text.length;
			const hashtagText = text.substr(0, endIndex);
			if (hashtagText && hashtagText.length > 0) {
				preSections.push({
					offset: counter,
					length: hashtagText.length + trigger.length,
					type: 'HASHTAG',
				});
			}
			counter += trigger.length;
		}
	}
	return preSections;
}

/**
 * The function returns an array of entity-sections in blocks.
 * These will be areas in block which have same entity or no entity applicable to them.
 */
function getSections(block: Block, hashConfig: HashConfig): Section[] {
	const sections: Section[] = [];
	let lastOffset = 0;
	let sectionRanges: PreSection[] = block.entityRanges.map(range => {
		const {offset, length, key} = range;
		return {
			offset,
			length,
			key,
			type: 'ENTITY',
		};
	});

	sectionRanges = sectionRanges.concat(
		getHashtagRanges(block.text, hashConfig),
	);

	sectionRanges = sectionRanges.sort((s1, s2) => s1.offset - s2.offset);
	sectionRanges.forEach((r: PreSection) => {
		if (r.offset > lastOffset) {
			sections.push({
				start: lastOffset,
				end: r.offset - 1,
			});
		}
		sections.push({
			start: r.offset,
			end: r.offset + r.length,
			entityKey: r.key,
			type: r.type,
		});
		lastOffset = r.offset + r.length;
	});
	if (lastOffset < block.text.length) {
		sections.push({
			start: lastOffset,
			end: block.text.length,
		});
	}
	return sections;
}

/**
 * Check if a string can be parsed to a valid JSON object
 */
function isJSONObjectString(jsonString: string): boolean {
	try {
		const o: unknown = JSON.parse(jsonString);

		// Has to be an object
		if (o && typeof o === "object") {
			return true;
		}
	} catch (_e) {
		// The JSON error is ignored since return false is after this block
	}
	return false;
}

/**
 * The function will return array of inline styles applicable to the block.
 */
function getStyleArrayForBlock(block: Block, config: Config): InlineStyles {
	const {text, inlineStyleRanges} = block;
	const inlineStyles: InlineStyles = {
		COLOR: new Array<string>(text.length),
		BGCOLOR: new Array<string>(text.length),
		FONTSIZE: new Array<string>(text.length),
		FONTFAMILY: new Array<string>(text.length),
		SUBSCRIPT: new Array<boolean>(text.length),
		SUPERSCRIPT: new Array<boolean>(text.length),
		CODE: new Array<boolean>(text.length),
		STRIKETHROUGH: new Array<boolean>(text.length),
		UNDERLINE: new Array<boolean>(text.length),
		ITALIC: new Array<boolean>(text.length),
		BOLD: new Array<boolean>(text.length),
		BLOCKQUOTE: new Array<boolean>(text.length),
		'CODE-BLOCK': new Array<boolean>(text.length),
		RAWCSS: new Array<string>(text.length),
		length: text.length,
	};
	if (inlineStyleRanges && inlineStyleRanges.length > 0) {
		inlineStyleRanges.forEach(inlineStyleRange => {
			const { offset, length } = inlineStyleRange;
			const lastOffset = offset + length;
			// This is ultra jank. It creates arrays the length of the characters and sets the styles to each one of them
			for (let i = offset; i < lastOffset; i++) {
				if (inlineStyleRange.style.startsWith('color-')) {
					inlineStyles.COLOR[i] = inlineStyleRange.style.substring(6);
				} else if (inlineStyleRange.style.startsWith('bgcolor-')) {
					inlineStyles.BGCOLOR[i] = inlineStyleRange.style.substring(8);
				} else if (inlineStyleRange.style.startsWith('fontsize-')) {
					inlineStyles.FONTSIZE[i] = inlineStyleRange.style.substring(9);
				} else if (inlineStyleRange.style.startsWith('fontfamily-')) {
					inlineStyles.FONTFAMILY[i] = inlineStyleRange.style.substring(11);
				//} else if ((BOOLEAN_INLINE_STYLE_NAMES as unknown as string[]).includes(inlineStyleRange.style)) {
				} else if (BOOLEAN_INLINE_STYLE_NAMES.includes(inlineStyleRange.style as BooleanInlineStyleNames)) {
					// Boolean style ranges
					inlineStyles[inlineStyleRange.style as BooleanInlineStyleNames][i] = true;
				} else if (isJSONObjectString(inlineStyleRange.style) && (config?.rawCssInlineStyles ?? false)) {
					// It's CSS in stringified JSON
					inlineStyles.RAWCSS[i] = Object.entries(JSON.parse(inlineStyleRange.style) as Record<string, string>)
						.map(([k, v]) => {
							k = k.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
							return `${k}:${v}`
						}).join(';') + ';';
				}
			}
		});
	}
	return inlineStyles;
}

/**
 * Function returns true for a set of styles if the value of these styles at an offset
 * are same as that on the previous offset.
 */
export function sameStyleAsPrevious(inlineStyles: InlineStyles, matchKeys: readonly InlineStyleNames[], index: number): boolean {
	let sameStyled = true;
	try {
		if (index > 0 && index < inlineStyles.length) {
			sameStyled = sameStyled && matchKeys.every(key => inlineStyles[key][index] === inlineStyles[key][index - 1]);
		} else {
			sameStyled = false;
		}
	} catch (error) {
		console.log(error);
		sameStyled = false;
	}
	return sameStyled;
}

/**
 * The function will return inline style applicable at some offset within a block.
 */
export function getStylesAtOffset(inlineStyles: InlineStyles, offset: number): SingleInlineStyles {
	//return Object.fromEntries(Object.entries(inlineStyles).filter(([key, _value] => INLINE_STYLE_NAMES.includes(key)).filter(([key, value]) => !!value[offset]).map(([key, value]) => value[offset]))

	// eslint-disable-next-line
	return Object.fromEntries(INLINE_STYLE_NAMES
				  .map(key => [key, inlineStyles[key]])
				  .filter(([_key, arr]) => !!arr[offset])
				  .map(([key, arr]) => [key, arr[offset]])
				 )
}

/**
 * For a given section in a block the function will return a further list of sections,
 * with similar inline styles applicable to them.
 */
function getStyleSections(block: Block, matchKeys: readonly InlineStyleNames[], start: number, end: number, config: Config): StyleSection[] {
	const styleSections: StyleSection[] = [];
	const { text } = block;
	if (text.length > 0) {
		const inlineStyles = getStyleArrayForBlock(block, config);

		for (let i = start; i < end; i += 1) {
			if (i === start) {
				styleSections.push({
					styles: getStylesAtOffset(inlineStyles, i),
					text: [text[i]],
					start: i,
					end: i + 1,
				});
			} else if (sameStyleAsPrevious(inlineStyles, matchKeys, i)) {
				styleSections[styleSections.length - 1].text.push(text[i]);
				styleSections[styleSections.length - 1].end = i + 1;
			}
		}
	}
	return styleSections;
}

/**
 * The function returns text for given section of block after doing required character replacements.
 */
function getSectionText(text: string[]): string {
	if (!text || text.length === 0) return '';
	const chars = text.map(ch => {
		switch (ch) {
			case '\n':
				return '\\s\\s\n';
			case '&':
				return '&amp;';
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			default:
				return ch;
		}
	});
	return chars.join('');
}

/**
 * Function returns markdown for inline style symbols.
 */
export function addInlineStyleMarkdown(style: string, content: string, styleTransform: StyleTransform): string {
	const value = styleTransform[style];
	if (value === null || typeof value === 'undefined') return content;
	let left: string, right: string;
	if (typeof value === 'string') {
		// It's a string
		left = value;
		right = value;
	} else {
		// It's an array
		[left, right] = value;
	}
	return `${left}${content}${right}`;
}

/**
 * The method returns markup for section to which inline styles
 * BOLD, UNDERLINE, ITALIC, STRIKETHROUGH, CODE, SUPERSCRIPT, SUBSCRIPT are applicable.
 */
function getStyleTagSectionMarkdown(styles: StyleTransformKey[], text: string, styleTransform: StyleTransform): string {
	return styles.reduce((acc, style) => addInlineStyleMarkdown(style, acc, styleTransform), text)
}

/**
 * Function returns html for text applying inline style in styles property in a span.
 * This only works for string inline styles.
 */
export function addStylePropertyMarkdown(styleSection: StyleSection): string {
	const {styles, text} = styleSection;
	const content = getSectionText(text);
	if (
		styles && Object.keys(styles).length !== 0
	) {
		let styleString = '';
		let extra = '';

		// styles is an object and style is a key in styles
		for (const styleName of STRING_INLINE_STYLE_NAMES) {
			const style = styles[styleName] as string | undefined;
			if (typeof style === 'undefined') continue;
			switch (styleName) {
				case 'COLOR':
					styleString += `color: ${style};`;
					extra += ' data-color="true"';
					break;
				case 'BGCOLOR':
					styleString += `background-color: ${style};`;
					extra += ' data-bgcolor="true"';
					break;
				case 'FONTSIZE':
					styleString += `font-size: ${style}px;`;
					extra += ' data-fontsize="true"';
					break;
				case 'FONTFAMILY':
					styleString += `font-family: ${style};`;
					extra += ' data-fontfamily="true"';
					break;
				case 'RAWCSS':
					styleString += style;
					extra += ' data-rawcss="true"';
				break;
			}
		}
		if (styleString.match(/^(?:;+|)$/)) return content;
		return `<span style="${styleString}"${extra}>${content}</span>`;
	}
	return content;
}

/**
 * The method returns markdown for an entity section.
 * An entity section is a continuous section in a block
 * to which same entity or no entity is applicable.
 */
function getSectionMarkdown(
	block: Block,
	entityMap: EntityMap,
	section: Section,
	customEntityTransform: CustomEntityTransform,
	config: Config
): string {
	const entitySectionMarkdown: string[] = [];
	const styleTransform: StyleTransform = {
		BOLD: '**',
		ITALIC: '*',
		UNDERLINE: '__',
		STRIKETHROUGH: '~~',
		CODE: '`',
		'CODE-BLOCK': ['```\n', '\n```'],
		BLOCKQUOTE: ['> ', ''],
		SUPERSCRIPT: ['<sup>', '</sup>'],
		SUBSCRIPT: ['<sub>', '</sub>'],
		...(config?.customStyleTransform || {}),
	};

	const styleSections = getStyleSections(
		block,
		BOOLEAN_INLINE_STYLE_NAMES,
		section.start,
		section.end,
		config,
	);
	let styleSectionText = '';
	styleSections.forEach(styleSection => {
		const stylePropertySections = getStyleSections(
			block,
			STRING_INLINE_STYLE_NAMES,
			styleSection.start,
			styleSection.end,
			config,
		);
		let stylePropertySectionText = '';
		stylePropertySections.forEach(stylePropertySection => {
			stylePropertySectionText += addStylePropertyMarkdown(
				stylePropertySection,
			);
		});
		styleSectionText += getStyleTagSectionMarkdown(
			Object.keys(styleSection.styles),
			stylePropertySectionText,
			styleTransform,
		);
	});
	entitySectionMarkdown.push(styleSectionText);
	let sectionText = entitySectionMarkdown.join('');
	if (section.type === 'ENTITY') {
		if (section.entityKey !== undefined && section.entityKey !== null) {
			sectionText = getEntityMarkdown(
				entityMap[section.entityKey],
				sectionText,
				customEntityTransform,
			);
		}
	} else if (section.type === 'HASHTAG') {
		sectionText = `[${sectionText}](${sectionText})`;
	}
	return sectionText;
}

/**
 * Replace leading blank spaces by &nbsp;
 */
export function trimLeadingZeros(sectionText: string): string {
	if (sectionText) {
		let replacedText = sectionText;
		for (let i = 0; i < replacedText.length; i += 1) {
			if (sectionText[i] === ' ') {
				replacedText = replacedText.replace(' ', '&nbsp;');
			} else {
				break;
			}
		}
		return replacedText;
	}
	return sectionText;
}

/**
 * Replace trailing blank spaces by &nbsp;
 */
export function trimTrailingZeros(sectionText: string): string {
	if (sectionText) {
		let replacedText = sectionText;
		for (let i = replacedText.length - 1; i >= 0; i -= 1) {
			if (replacedText[i] === ' ') {
				replacedText = `${replacedText.substring(
					0,
					i,
				)}&nbsp;${replacedText.substring(i + 1)}`;
			} else {
				break;
			}
		}
		return replacedText;
	}
	return sectionText;
}

/**
 * Function will return the markdown for block content.
 */
export function getBlockContentMarkdown(
	block: Block,
	entityMap: EntityMap,
	hashConfig: HashConfig,
	customEntityTransform: CustomEntityTransform,
	config: Config,
): string {
	if (isAtomicBlock(block)) {
		return getEntityMarkdown(
			entityMap[block.entityRanges[0].key],
			'', // atomics in Wix are ' ' and the original version of this library passed in undefined
			customEntityTransform,
		);
	}
	const blockMarkdown: string[] = [];
	const entitySections = getSections(block, hashConfig);
	entitySections.forEach((section, index) => {
		let sectionText = getSectionMarkdown(
			block,
			entityMap,
			section,
			customEntityTransform,
			config,
		);
		if (index === 0) {
			// First element
			sectionText = trimLeadingZeros(sectionText);
		} else if (index === entitySections.length - 1) {
			// Last element
			sectionText = trimTrailingZeros(sectionText);
		}
		blockMarkdown.push(sectionText);
	});
	return blockMarkdown.join('');
}

/**
 * Function will return style string for a block.
 */
export function getBlockStyle(data: Record<string, string>): string {
	let styles = '';
	forEach(data, (key, value) => {
		styles += `${key}:${value};`;
	});
	return styles;
}

/**
 * FUnciton will add <span> with style property aroung block content for block level text-styling.
 */
function getBlockStyleProperty(blockData: Record<string, string>, content: string): string {
	const blockStyle = getBlockStyle(blockData);
	if (blockStyle) {
		return `<span style="${blockStyle}">${content}</span>`;
	}
	return content;
}

/**
 * Function will return markdown for the block.
 */
function getBlockMarkdown(
	block: Block,
	blockTypesMapping: BlockTypesMapping,
	entityMap: EntityMap,
	hashConfig: HashConfig,
	customEntityTransform: CustomEntityTransform,
	config: Config,
): string {
	const blockMarkdown: string[] = [];
	if (Object.hasOwn(blockTypesMapping, block.type)) blockMarkdown.push(blockTypesMapping[block.type]);
	const blockContentMarkdown = getBlockContentMarkdown(
		block,
		entityMap,
		hashConfig,
		customEntityTransform,
		config,
	);

	// Non-standard
	/*if (block.data) {
		blockContentMarkdown = getBlockStyleProperty(
			block.data as unknown as Record<string, string>,
			blockContentMarkdown,
		);
	}*/

	blockMarkdown.push(blockContentMarkdown);
	blockMarkdown.push(
		config && config?.emptyLineBeforeBlock
			? `${config?.printBreakLineLiteral ? `\\n\n\n` : `\n\n`}`
			: `${config?.printBreakLineLiteral ? `\\n` : `\n`}`,
	);
	return blockMarkdown.join('');
}

function getDepthPadding(depth: number): string {
	/*let padding = '';
	for (let i = 0; i < depth * 4; i += 1) {
		padding += ' ';
	}
	return padding;*/
	return ' '.repeat(depth * 4);
}

/**
 * The function will generate markdown for given draftjs editorContent.
 */
function draftToMarkdown(
	editorContent: EditorContent,
	hashConfig: Partial<HashConfig>,
	customEntityTransform: CustomEntityTransform,
	config: Config,
): string {
	const fullHashConfig: HashConfig = {
		trigger: hashConfig.trigger ?? '#',
		separator: hashConfig.separator ?? ' ',
	}
	const markdown: string[] = [];
	if (editorContent) {
		// @ts-ignore: This doesn't work for some reeason
		const blockTypesMapping: BlockTypesMapping = {
			...defaultBlockTypesMapping as BlockTypesMapping,
			...(config?.blockTypesMapping ?? {}) as Partial<BlockTypesMapping>,
		};
		const {blocks, entityMap} = editorContent;
		if (blocks && blocks.length > 0) {
			blocks.forEach(block => {
				let content = getBlockMarkdown(
					block,
					blockTypesMapping,
					entityMap,
					fullHashConfig,
					customEntityTransform,
					config,
				);
				if (isList(block.type)) {
					content = getDepthPadding(block.depth) + content;
				}
				markdown.push(content);
			});
		}
	}
	return markdown.join('');
}
export default draftToMarkdown;
