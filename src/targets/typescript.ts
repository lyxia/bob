import chalk from 'chalk';
import path from 'path';
import child_process from 'child_process';
import fs from 'fs-extra';
import del from 'del';
import { platform } from 'os';
import { Input } from '../types';
import glob from 'glob';

export default async function build({ root, source, output, report, tsconfig }: Input) {
  report.info(
    `Cleaning up previous build at ${chalk.blue(path.relative(root, output))}`
  );

  await del([output]);

  report.info(`Generating type definitions with ${chalk.blue('tsc')}`);

  // const tsconfig = path.join(root, 'tsconfig.json');
  tsconfig = tsconfig || path.join(root, 'tsconfig.json')

  try {
    if (await fs.pathExists(tsconfig)) {
      const config = JSON.parse(await fs.readFile(tsconfig, 'utf-8'));

      if (config.compilerOptions) {
        const conflicts: string[] = [];

        if (config.compilerOptions.noEmit !== undefined) {
          conflicts.push('compilerOptions.noEmit cannot set');
        }

        // if (config.compilerOptions.emitDeclarationOnly !== true) {
        //   conflicts.push('compilerOptions.emitDeclarationOnly must set true');
        // }

        if (config.compilerOptions.outDir) {
          const configOutDir = path.resolve(root, config.compilerOptions.outDir)
          if(configOutDir !== output) {
            conflicts.push(`compilerOptions.outDir must set ${output}`);
          }
        } else {
          conflicts.push(`compilerOptions.outDir must set ${output}`);
        }

        // if (config.compilerOptions.declarationDir) {
        //   conflicts.push('compilerOptions.declarationDir cannot set');
        // }

        if (conflicts.length) {
          report.warn(
            `Found following options in the config file which can conflict with the CLI options. Please modify them from ${chalk.blue(
              'tsconfig.json'
            )}:${conflicts.reduce(
              (acc, curr) => acc + `\n${chalk.gray('-')} ${chalk.yellow(curr)}`,
              ''
            )}`
          );
        }
      }
    }

    let tsc =
      path.join(root, 'node_modules', '.bin', 'tsc') +
      (platform() === 'win32' ? '.cmd' : '');

    if (!await fs.pathExists(tsc)) {
      tsc = child_process.execSync('which tsc').toString('utf-8').trim();
    }

    if (await fs.pathExists(tsc)) {
      child_process.execFileSync(tsc, [
        '--build',
        tsconfig
      ]);

      report.success(
        `Wrote definition files to ${chalk.blue(path.relative(root, output))}`
      );
    } else {
      throw new Error(
        `The ${chalk.blue(
          'tsc'
        )} binary doesn't seem to be installed under ${chalk.blue(
          'node_modules'
        )} or present in $PATH. Make sure you have added ${chalk.blue(
          'typescript'
        )} to your ${chalk.blue('devDependencies')}.`
      );
    }

    const files = glob.sync('**/*', {
      cwd: source,
      absolute: true,
      nodir: true,
      ignore: '**/{__tests__,__fixtures__}/**',
    });
    await Promise.all(
      files.map(async filepath => {
        const outputFilename = path
          .join(output, path.relative(source, filepath))
          .replace(/\.(ts|tsx?)$/, '.js');
  
        await fs.mkdirp(path.dirname(outputFilename));
  
        if (!/\.(ts|tsx?)$/.test(filepath)) {
          // Copy files which aren't source code
          fs.copy(filepath, outputFilename);
          return;
        }
      })
    );
  } catch (e) {
    if (e.stdout) {
      report.error(
        `Errors found when building definition files:\n${e.stdout.toString()}`
      );
    } else {
      report.error(e.message);
    }

    throw new Error('Failed to build definition files.');
  }
}
