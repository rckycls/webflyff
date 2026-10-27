// The jobs' names (`etc.inc`'s `job` block), copying CProject::LoadEtc (Source/_Common/Project.cpp:903-950), which
// CProject::OpenProject calls for "etc.inc" (:565) to fill `m_aJob`, the table `CMover::GetJobString` reads the job's name
// from (MoverParam.cpp:354-359). A list of blocks read token by token (CScript):
//
//   job
//   {
//   	JOB_VAGRANT		IDS_ETC_INC_000000		JOB_VAGRANT	JTYPE_BASE
//   	JOB_MERCENARY		IDS_ETC_INC_000001		JOB_VAGRANT	JTYPE_EXPERT
//   	...
//   }
//   structure { ... }   Guild { ... }
//
// A job row is the job (`id`), its name (`szName`: CScript's token, a string-table text for an `IDS_*` key), its base job
// (`dwJobBase`) and its type (`dwJobType`, `JTYPE_*`). The `structure` and `Guild` blocks name other tables (two words a
// row) and are read past.

import { ScriptReader } from '../script/cscript';

/** A row of `m_aJob` (`JOB`, ProjectCmn.h): the job's name, its base job and its type. */
export interface EtcJob {
  /** `szName`: the job's name as the windows show it (`GetJobString`), the string-table text of the row's `IDS_*` key. */
  name: string;
  /** `dwJobBase`: the job it is reached from (`JOB_*`). */
  base: number;
  /** `dwJobType`: `JTYPE_BASE`, `JTYPE_EXPERT`, `JTYPE_PRO`, `JTYPE_MASTER` or `JTYPE_HERO` (defineJob.h). */
  type: number;
}

const READER = 'readEtcJobs';
const CPP_REF = 'Source/_Common/Project.cpp:903 CProject::LoadEtc';

/** The blocks of two words a row (`structure`, `Guild`: an id and a name, Project.cpp:923-946). */
const NAME_BLOCKS: ReadonlySet<string> = new Set(['structure', 'Guild']);

/**
 * Reads the text of `etc.inc` (see `decodeScript`) into the jobs of its `job` block, by job (`m_aJob[ id ]`). `defines`
 * give the `JOB_*` and `JTYPE_*` values and `strings` the names (`IDS_ETC_INC_*`); a name the string table lacks is
 * kept as written, as CScript leaves such a token. A row that stops before its four words throws a FormatError (the C++
 * reads an empty token and 0).
 */
export function readEtcJobs(
  text: string,
  defines: ReadonlyMap<string, number>,
  strings: ReadonlyMap<string, string>,
  file = 'etc.inc',
): Map<number, EtcJob> {
  const r = new ScriptReader(text, defines, strings, { file, reader: READER, cppRef: CPP_REF });
  const jobs = new Map<number, EtcJob>();
  // `*script.token != '}'`: the number just read was the block's closing brace
  const closed = (): boolean => r.lastToken()?.text.startsWith('}') === true;

  for (let at = r.tokenOrEnd(); at !== undefined; at = r.tokenOrEnd()) { // do { GetToken() ... } while( tok != FINISHED )
    if (at.text === 'job') {
      r.token("'{' after job");
      let id = r.number('the first job');
      while (!closed()) {
        const name = r.token(`the name of job ${id}`).text;
        const base = r.number(`the base job of job ${id}`);
        const type = r.number(`the type of job ${id}`);
        jobs.set(id, { name, base, type });
        id = r.number("the next job or '}'");
      }
    } else if (NAME_BLOCKS.has(at.text)) {
      r.token(`'{' after ${at.text}`);
      r.number(`the first id of ${at.text}`);
      while (!closed()) {
        r.token(`a name of ${at.text}`);
        r.number(`the next id of ${at.text} or '}'`);
      }
    }
  }
  return jobs;
}
