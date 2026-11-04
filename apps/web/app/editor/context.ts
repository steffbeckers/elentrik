import type { InjectionKey } from 'vue';
import type { ProjectenApi } from '../composables/useProjectenApi';
import type { BestandenApi } from '../composables/useBestandenApi';
import type { AdminProjectApi } from '../composables/useAdminProjectApi';
import type { ExportInfo } from '../../shared/exports';

export type EditorContext = {
  modus: 'klant' | 'admin'; projectId: string; gebruikerId: string; terug: string;
  projecten: Pick<ProjectenApi, 'haal' | 'bewaar'>; bestanden: BestandenApi;
  exportLijst: (id: string) => Promise<ExportInfo[]>; bestandUrl: (id: string) => string;
  mogelijkheden: { schrijven: boolean; dupliceren: boolean; nieuwProject: boolean; exporteren: boolean };
  klant?: Pick<ProjectenApi, 'dupliceer' | 'maakUitDocument'>;
  support?: AdminProjectApi;
  bedrijfNaam?: string;
};
export const editorContextKey: InjectionKey<EditorContext> = Symbol('Elentrik editorcontext');
