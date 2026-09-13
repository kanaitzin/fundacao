/**
 * PORTA PÚBLICA — módulo `people`
 *
 * Perfil do Acolhido: pessoa, episódio, permanência, saúde, documentos,
 * benefícios restritos e transferências.
 *
 * O que outros módulos podem usar daqui é apenas a consulta de acolhidos
 * ativos de uma casa — o suficiente para montar chamadas e linha do tempo,
 * sem abrir perfil, documentos ou área bancária.
 */
export { PeopleModule } from './people.module';
export { PeopleService } from './people.service';
export type { PersonSummary } from './people.service';
export { AniversariosService } from './aniversarios.service';
