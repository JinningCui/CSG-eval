const { optimize } = require('svgo');
const fs = require('fs');
const path = require('path');
const fsp = fs.promises;

/**
 * 单个 SVG/XML 优化逻辑
 * 使用 SVGO 工业级插件进行扁平化和精简，并删除位图图像
 */
async function optimizeSingleFile(content) {
    const result = optimize(content, {
        multipass: true,
        plugins: [
            {
                name: 'preset-default',
                params: {
                    overrides: {
                        // 保留 <rect>/<line>/<circle>/<polyline> 等原生图元，不转成 <path>，
                        // 便于下游(svg-chart-reuse)按元素类型识别刻度/网格/柱子等组件
                        convertShapeToPath: false,
                        // 保留 viewBox(原 active:false 在新版 SVGO 已失效，这里用 overrides 正确关闭)
                        removeViewBox: false,
                    },
                },
            },
            'convertStyleToAttrs',
            // 自定义插件：删除所有的 <image> 标签（位图/Base64）
            {
                name: 'removeBitmapImages',
                fn: () => {
                    return {
                        element: {
                            enter: (node, parentNode) => {
                                if (node.name === 'image') {
                                    parentNode.children = parentNode.children.filter(child => child !== node);
                                }
                            },
                        },
                    };
                },
            },
            {
                name: 'convertTransform',
                params: {
                    collapseIntoPaths: true, 
                    floatPrecision: 1,       
                }
            },
            {
                name: 'cleanupNumericValues',
                params: {
                    floatPrecision: 1,
                }
            }
        ],
    });
    return result.data;
}

/**
 * 预处理并修复常见的 XML/SVG 结构问题
 */
function preprocessSVGContent(content) {
    const startTag = '<svg';
    const endTag = '</svg>';
    
    const startIndex = content.indexOf(startTag);
    if (startIndex === -1) return null;

    let depth = 0;
    let currentIndex = startIndex;
    let matchedEndIndex = -1;

    while (currentIndex < content.length) {
        const nextOpen = content.indexOf(startTag, currentIndex);
        const nextClose = content.indexOf(endTag, currentIndex);

        if (nextClose === -1) break; 

        if (nextOpen !== -1 && nextOpen < nextClose) {
            depth++;
            currentIndex = nextOpen + startTag.length;
        } else {
            depth--;
            if (depth === 0) {
                matchedEndIndex = nextClose + endTag.length;
                break;
            }
            currentIndex = nextClose + endTag.length;
        }
    }

    if (matchedEndIndex === -1) return null;

    let svg = content.slice(startIndex, matchedEndIndex).trim();

    if (/xlink:/i.test(svg)) {
        const openingTagEnd = svg.indexOf('>');
        const openingTag = svg.slice(0, openingTagEnd);
        
        if (!/xmlns:xlink/i.test(openingTag)) {
            svg = svg.slice(0, 4) + ' xmlns:xlink="http://www.w3.org/1999/xlink"' + svg.slice(4);
        }
    }
    
    return svg;
}

/**
 * 并行批量处理器
 */
async function processBeagleSources(sourceDirs, outputBase) {
    if (!fs.existsSync(outputBase)) {
        await fsp.mkdir(outputBase, { recursive: true });
    }

    let overallStats = {
        totalRawLength: 0,
        totalOptimizedLength: 0,
        processedCount: 0,
        skippedCount: 0
    };

    const CONCURRENCY_LIMIT = 20; 

    for (const sourceDir of sourceDirs) {
        let stats = {
            totalRawLength: 0,
            totalOptimizedLength: 0,
            processedCount: 0,
            skippedCount: 0
        };
        if (!fs.existsSync(sourceDir)) {
            console.warn(`\n⚠️ [跳过] 路径未找到: ${sourceDir}`);
            continue;
        }

        const normalizedSource = path.resolve(sourceDir);
        const marker = `Dataset${path.sep}Beagle${path.sep}`;
        const markerIndex = normalizedSource.indexOf(marker);
        const relativePath = markerIndex !== -1
            ? normalizedSource.slice(markerIndex + marker.length)
            : path.basename(normalizedSource);

        const outputRoot = path.join(outputBase, relativePath);
        const folderNames = fs.readdirSync(sourceDir).filter(name => 
            fs.statSync(path.join(sourceDir, name)).isDirectory()
        );

        console.log(`\n📂 数据集: ${relativePath}`);
        console.log(`待处理文件夹总数: ${folderNames.length}`);

        for (let i = 0; i < folderNames.length; i += CONCURRENCY_LIMIT) {
            const chunk = folderNames.slice(i, i + CONCURRENCY_LIMIT);
            
            await Promise.all(chunk.map(async (folderName) => {
                const svgPath = path.join(sourceDir, folderName, 'cleaned_svg.txt');
                if (!fs.existsSync(svgPath)) {
                    console.warn(`\n⚠️ 跳过 [文件夹: ${folderName}] 在 [${relativePath}]`);
                    console.warn(`   原因: 缺少 cleaned_svg.txt`);
                    stats.skippedCount++;
                    return;
                }

                try {
                    const fileContent = await fsp.readFile(svgPath, 'utf8');
                    const rawContent = preprocessSVGContent(fileContent);
                    
                    if (!rawContent) {
                        console.warn(`\n⚠️ 跳过 [文件夹: ${folderName}] 在 [${relativePath}]`);
                        console.warn(`   原因: 未匹配到完整 <svg>...</svg>`);
                        stats.skippedCount++;
                        return;
                    }

                    const optimizedSVG = await optimizeSingleFile(rawContent);
                    const outputDir = path.join(outputRoot, folderName);
                    
                    if (!fs.existsSync(outputDir)) {
                        await fsp.mkdir(outputDir, { recursive: true });
                    }

                    const outputPath = path.join(outputDir, 'svg.txt');
                    await fsp.writeFile(outputPath, optimizedSVG);

                    stats.totalRawLength += rawContent.length;
                    stats.totalOptimizedLength += optimizedSVG.length;
                    stats.processedCount += 1;

                } catch (err) {
                    console.error(`\n❌ 错误 [文件夹: ${folderName}] 在 [${relativePath}]`);
                    console.error(`   原因: ${err.message}`);
                    stats.skippedCount++;
                }
            }));

            if (i % (CONCURRENCY_LIMIT * 5) === 0 || i + CONCURRENCY_LIMIT >= folderNames.length) {
                const progress = (((i + chunk.length) / folderNames.length) * 100).toFixed(1);
                process.stdout.write(`\r进度: ${progress}% (${i + chunk.length}/${folderNames.length}) | 已处理: ${stats.processedCount} `);
            }
        }
        console.log(`\n✅ 数据集完成: ${relativePath}`);

        if (stats.processedCount > 0) {
            const avgLength = stats.totalOptimizedLength / stats.processedCount;
            const reduction = ((stats.totalRawLength - stats.totalOptimizedLength) / stats.totalRawLength) * 100;
            console.log('--------------------------------------------------');
            console.log(`📊 数据集统计: ${relativePath}`);
            console.log(`- 处理成功文件数:  ${stats.processedCount}`);
            console.log(`- 跳过/失败文件数: ${stats.skippedCount}`);
            console.log(`- 平均 SVG 长度:   ${avgLength.toFixed(2)} 字符`);
            console.log(`- 总长度压缩率:    ${reduction.toFixed(2)}%`);
            console.log('--------------------------------------------------');
        } else {
            console.log('--------------------------------------------------');
            console.log(`📊 数据集统计: ${relativePath}`);
            console.log(`- 处理成功文件数:  0`);
            console.log(`- 跳过/失败文件数: ${stats.skippedCount}`);
            console.log('--------------------------------------------------');
        }

        overallStats.totalRawLength += stats.totalRawLength;
        overallStats.totalOptimizedLength += stats.totalOptimizedLength;
        overallStats.processedCount += stats.processedCount;
        overallStats.skippedCount += stats.skippedCount;
    }

    if (overallStats.processedCount > 0) {
        const avgLength = overallStats.totalOptimizedLength / overallStats.processedCount;
        const reduction = ((overallStats.totalRawLength - overallStats.totalOptimizedLength) / overallStats.totalRawLength) * 100;

        console.log('\n==================================================');
        console.log('📊 清洗统计结果:');
        console.log(`- 处理成功文件数:  ${overallStats.processedCount}`);
        console.log(`- 跳过/失败文件数: ${overallStats.skippedCount}`);
        console.log(`- 平均 SVG 长度:   ${avgLength.toFixed(2)} 字符`);
        console.log(`- 总长度压缩率:    ${reduction.toFixed(2)}%`);
        
        const csvContent = `metric,value\nprocessed_count,${overallStats.processedCount}\navg_length,${avgLength.toFixed(2)}\nreduction_percent,${reduction.toFixed(2)}`;
        await fsp.writeFile(path.join(outputBase, 'svgo_summary.csv'), csvContent);
        console.log(`- 统计报表已保存:  ${path.join(outputBase, 'svgo_summary.csv')}`);
        console.log('==================================================');
    }
}

/**
 * 扁平目录处理器：读取 sourceDir 下所有 *.svg，SVGO 优化后写到 outputDir（同名文件）。
 * 用于 VisAnatomy/charts_svg_cleaned 这种扁平结构（非 Beagle 的 folder/cleaned_svg.txt）。
 */
async function processFlatDir(sourceDir, outputDir) {
    if (!fs.existsSync(sourceDir)) {
        console.warn(`⚠️ [跳过] 源目录未找到: ${sourceDir}`);
        return;
    }
    if (!fs.existsSync(outputDir)) {
        await fsp.mkdir(outputDir, { recursive: true });
    }

    const files = fs.readdirSync(sourceDir).filter(n => n.toLowerCase().endsWith('.svg'));
    console.log(`📂 源目录: ${sourceDir}`);
    console.log(`待处理 SVG 文件数: ${files.length}`);
    console.log(`输出目录: ${outputDir}`);

    const stats = { raw: 0, opt: 0, ok: 0, skip: 0 };
    const CONCURRENCY_LIMIT = 20;

    for (let i = 0; i < files.length; i += CONCURRENCY_LIMIT) {
        const chunk = files.slice(i, i + CONCURRENCY_LIMIT);
        await Promise.all(chunk.map(async (fileName) => {
            const svgPath = path.join(sourceDir, fileName);
            try {
                const fileContent = await fsp.readFile(svgPath, 'utf8');
                const rawContent = preprocessSVGContent(fileContent);
                if (!rawContent) {
                    console.warn(`\n⚠️ 跳过 ${fileName}: 未匹配到完整 <svg>...</svg>`);
                    stats.skip++;
                    return;
                }
                const optimizedSVG = await optimizeSingleFile(rawContent);
                await fsp.writeFile(path.join(outputDir, fileName), optimizedSVG);
                stats.raw += rawContent.length;
                stats.opt += optimizedSVG.length;
                stats.ok += 1;
            } catch (err) {
                console.error(`\n❌ 错误 ${fileName}: ${err.message}`);
                stats.skip++;
            }
        }));
        const progress = (((i + chunk.length) / files.length) * 100).toFixed(1);
        process.stdout.write(`\r进度: ${progress}% (${i + chunk.length}/${files.length}) | 成功: ${stats.ok} `);
    }
    console.log();

    if (stats.ok > 0) {
        const avgLength = stats.opt / stats.ok;
        const reduction = ((stats.raw - stats.opt) / stats.raw) * 100;
        console.log('==================================================');
        console.log(`📊 SVGO 优化统计`);
        console.log(`- 处理成功文件数:  ${stats.ok}`);
        console.log(`- 跳过/失败文件数: ${stats.skip}`);
        console.log(`- 平均 SVG 长度:   ${avgLength.toFixed(2)} 字符`);
        console.log(`- 总长度压缩率:    ${reduction.toFixed(2)}%`);
        console.log('==================================================');
    }
}

// --- 路径配置 (VisAnatomy 扁平目录) ---
const SOURCE_DIR = "/Users/cjn/Desktop/个人/Project/Vis2026/VisAnatomy/charts_svg_cleaned";
const OUTPUT_DIR = "/Users/cjn/Desktop/个人/Project/Vis2026/VisAnatomy/charts_svg_cleaned_svgo";

processFlatDir(SOURCE_DIR, OUTPUT_DIR)
    .then(() => console.log('\n✨ 所有任务已顺利执行完毕！'))
    .catch(console.error);
