import { readFileSync } from 'node:fs';

export interface ParsedTeam {
  divisionName: string;
  name: string;
  projectName: string;
  owner: string;
  members: string[];
  oneLiner: string;
}

export interface ParsedSeed {
  divisions: string[];
  teams: ParsedTeam[];
}

const DIVISION_HEADER = /^#\s+[A-Z]\.\s+(.+?)\s*$/;
const TEAM_HEADER = /^##\s+[A-Z]-\d+\.\s+(.+?)\s*$/;
const FIELD_TEAM_NAME = /^-\s+\*\*팀명\*\*:\s*(.+?)\s*$/;
const FIELD_PROJECT = /^-\s+\*\*프로젝트명\/아이디어명\*\*:\s*(.+?)\s*$/;
const FIELD_OWNER = /^-\s+\*\*접수자\s*\(Works\)\*\*:\s*(.+?)\s*$/;
const FIELD_MEMBERS_HEADER = /^-\s+\*\*팀원\s*정보(?:\s*\(1차접수\))?\*\*\s*:?\s*$/;
const FIELD_ONELINER = /^-\s+\*\*한\s*줄\s*설명\*\*:\s*(.+?)\s*$/;
const MEMBER_BULLET = /^\s{2,}-\s+(.+?)\s*$/;
const ANY_TOP_BULLET = /^-\s+\*\*/;

export function parseSeedMarkdown(markdown: string): ParsedSeed {
  const lines = markdown.split(/\r?\n/);
  const divisions: string[] = [];
  const teams: ParsedTeam[] = [];

  let currentDivision: string | null = null;
  let currentTeam: ParsedTeam | null = null;
  let collectingMembers = false;

  const flushTeam = () => {
    if (currentTeam) teams.push(currentTeam);
    currentTeam = null;
    collectingMembers = false;
  };

  for (const line of lines) {
    const divMatch = line.match(DIVISION_HEADER);
    if (divMatch) {
      flushTeam();
      currentDivision = divMatch[1];
      if (!divisions.includes(currentDivision)) divisions.push(currentDivision);
      continue;
    }

    const teamMatch = line.match(TEAM_HEADER);
    if (teamMatch) {
      flushTeam();
      if (!currentDivision) {
        throw new Error(`Team header before any division: ${line}`);
      }
      currentTeam = {
        divisionName: currentDivision,
        name: teamMatch[1],
        projectName: '',
        owner: '',
        members: [],
        oneLiner: '',
      };
      continue;
    }

    if (!currentTeam) continue;

    const nameMatch = line.match(FIELD_TEAM_NAME);
    if (nameMatch) {
      currentTeam.name = nameMatch[1];
      collectingMembers = false;
      continue;
    }

    const projMatch = line.match(FIELD_PROJECT);
    if (projMatch) {
      currentTeam.projectName = projMatch[1];
      collectingMembers = false;
      continue;
    }

    const ownerMatch = line.match(FIELD_OWNER);
    if (ownerMatch) {
      currentTeam.owner = ownerMatch[1];
      collectingMembers = false;
      continue;
    }

    if (FIELD_MEMBERS_HEADER.test(line)) {
      collectingMembers = true;
      continue;
    }

    const oneLinerMatch = line.match(FIELD_ONELINER);
    if (oneLinerMatch) {
      currentTeam.oneLiner = oneLinerMatch[1];
      collectingMembers = false;
      continue;
    }

    if (collectingMembers) {
      if (ANY_TOP_BULLET.test(line)) {
        collectingMembers = false;
      } else {
        const memberMatch = line.match(MEMBER_BULLET);
        if (memberMatch) {
          currentTeam.members.push(memberMatch[1]);
        }
      }
    }
  }

  flushTeam();

  return { divisions, teams };
}

export function loadSeedFromFile(filePath: string): ParsedSeed {
  const md = readFileSync(filePath, 'utf8');
  return parseSeedMarkdown(md);
}

export const CRITERIA_SEED: ReadonlyArray<{
  name: string;
  weight: number;
  indicator: string;
  order: number;
}> = [
  { order: 1, name: '문제 정의 명확성', weight: 20, indicator: '해결 대상 문제와 가치가 구체적이고 명확한가' },
  { order: 2, name: '구현 실현 가능성', weight: 30, indicator: '기술·일정·리소스 측면에서 실제 구현 가능한가' },
  { order: 3, name: '차별성·독창성', weight: 20, indicator: '기존 솔루션 대비 차별성·독창성이 있는가' },
  { order: 4, name: '업무 혁신성', weight: 15, indicator: '실제 업무 방식·생산성을 혁신할 수 있는가' },
  { order: 5, name: '확산 파급력', weight: 15, indicator: '전사·타 본부로 확장 가능한 파급력을 갖추었는가' },
];

export const EXPECTED_DIVISIONS = 8;
export const EXPECTED_TEAMS = 35;
export const EXPECTED_CRITERIA = 5;
