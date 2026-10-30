## Tabela de contraste (medida pelo script)

Razão WCAG 2.x calculada sobre o hex de cada token (o OKLCH é convertido para sRGB, com corte de croma quando sai da gama). Mínimos: 4,5 para texto, 3 para borda de controle, foco e elemento grande. A linha "borda do aviso" é só informativa (a borda é enfeite; a palavra e o desenho carregam o sentido).

### Claro (navy da Fundação)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#131C29` | `#F1F5F9` | 15.64 | 4.5 | passa |
| texto-2 / fundo | `#353F4D` | `#F1F5F9` | 9.73 | 4.5 | passa |
| apoio / fundo | `#586371` | `#F1F5F9` | 5.58 | 4.5 | passa |
| texto / cartao | `#131C29` | `#FFFFFF` | 17.13 | 4.5 | passa |
| texto-2 / cartao | `#353F4D` | `#FFFFFF` | 10.66 | 4.5 | passa |
| apoio / cartao | `#586371` | `#FFFFFF` | 6.11 | 4.5 | passa |
| texto / rebaixado | `#131C29` | `#E8EEF4` | 14.66 | 4.5 | passa |
| texto-2 / rebaixado | `#353F4D` | `#E8EEF4` | 9.12 | 4.5 | passa |
| apoio / rebaixado | `#586371` | `#E8EEF4` | 5.23 | 4.5 | passa |
| texto / elevado | `#131C29` | `#FFFFFF` | 17.13 | 4.5 | passa |
| texto-2 / elevado | `#353F4D` | `#FFFFFF` | 10.66 | 4.5 | passa |
| apoio / elevado | `#586371` | `#FFFFFF` | 6.11 | 4.5 | passa |
| texto / folha | `#131C29` | `#FFFFFF` | 17.13 | 4.5 | passa |
| texto-2 / folha | `#353F4D` | `#FFFFFF` | 10.66 | 4.5 | passa |
| apoio / folha | `#586371` | `#FFFFFF` | 6.11 | 4.5 | passa |
| título / fundo | `#003262` | `#F1F5F9` | 11.74 | 4.5 | passa |
| título / cartão | `#003262` | `#FFFFFF` | 12.86 | 4.5 | passa |
| marca (link) / cartão | `#005993` | `#FFFFFF` | 7.37 | 4.5 | passa |
| marca (link) / fundo | `#005993` | `#F1F5F9` | 6.73 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#005993` | `#E1F0FE` | 6.35 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#FFFFFF` | `#005993` | 7.37 | 4.5 | passa |
| sobre-marca / marca-hover | `#FFFFFF` | `#00497A` | 9.40 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#003262` | `#E1F0FE` | 11.08 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#76828E` | `#FFFFFF` | 3.92 | 3 | passa |
| linha-forte / rebaixado | `#76828E` | `#E8EEF4` | 3.36 | 3 | passa |
| foco / cartão | `#0074B8` | `#FFFFFF` | 5.01 | 3 | passa |
| foco / fundo | `#0074B8` | `#F1F5F9` | 4.57 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#005993` | `#F1F5F9` | 6.73 | 3 | passa |
| crit: texto / pílula | `#A91D1D` | `#FFEFEF` | 6.54 | 4.5 | passa |
| crit: texto / cartão | `#A91D1D` | `#FFFFFF` | 7.29 | 4.5 | passa |
| crit: texto-2 / aviso | `#353F4D` | `#FFEFEF` | 9.57 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#FFFFFF` | `#B91C1E` | 6.47 | 4.5 | passa |
| crit: borda do aviso / cartão | `#FBBBB8` | `#FFFFFF` | 1.63 | — | info |
| warn: texto / pílula | `#8C4705` | `#FFF5E0` | 6.42 | 4.5 | passa |
| warn: texto / cartão | `#8C4705` | `#FFFFFF` | 6.96 | 4.5 | passa |
| warn: texto-2 / aviso | `#353F4D` | `#FFF5E0` | 9.84 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#FFFFFF` | `#8C4705` | 6.96 | 4.5 | passa |
| warn: borda do aviso / cartão | `#F4CA89` | `#FFFFFF` | 1.54 | — | info |
| ok: texto / pílula | `#006D4E` | `#E2FBEF` | 5.85 | 4.5 | passa |
| ok: texto / cartão | `#006D4E` | `#FFFFFF` | 6.37 | 4.5 | passa |
| ok: texto-2 / aviso | `#353F4D` | `#E2FBEF` | 9.79 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#FFFFFF` | `#006D4E` | 6.37 | 4.5 | passa |
| ok: borda do aviso / cartão | `#9FDEC2` | `#FFFFFF` | 1.53 | — | info |
| info: texto / pílula | `#2556B4` | `#EBF4FF` | 6.16 | 4.5 | passa |
| info: texto / cartão | `#2556B4` | `#FFFFFF` | 6.84 | 4.5 | passa |
| info: texto-2 / aviso | `#353F4D` | `#EBF4FF` | 9.60 | 4.5 | passa |
| info: sobre-sólido / sólido | `#FFFFFF` | `#2556B4` | 6.84 | 4.5 | passa |
| info: borda do aviso / cartão | `#B6D0F6` | `#FFFFFF` | 1.57 | — | info |

### Escuro (noite azul, não cinza)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#E6EAEF` | `#0B1016` | 15.80 | 4.5 | passa |
| texto-2 / fundo | `#C5CBD3` | `#0B1016` | 11.69 | 4.5 | passa |
| apoio / fundo | `#9BA4B0` | `#0B1016` | 7.57 | 4.5 | passa |
| texto / cartao | `#E6EAEF` | `#141921` | 14.60 | 4.5 | passa |
| texto-2 / cartao | `#C5CBD3` | `#141921` | 10.80 | 4.5 | passa |
| apoio / cartao | `#9BA4B0` | `#141921` | 7.00 | 4.5 | passa |
| texto / rebaixado | `#E6EAEF` | `#0E1319` | 15.44 | 4.5 | passa |
| texto-2 / rebaixado | `#C5CBD3` | `#0E1319` | 11.42 | 4.5 | passa |
| apoio / rebaixado | `#9BA4B0` | `#0E1319` | 7.40 | 4.5 | passa |
| texto / elevado | `#E6EAEF` | `#1B212A` | 13.39 | 4.5 | passa |
| texto-2 / elevado | `#C5CBD3` | `#1B212A` | 9.91 | 4.5 | passa |
| apoio / elevado | `#9BA4B0` | `#1B212A` | 6.42 | 4.5 | passa |
| texto / folha | `#E6EAEF` | `#20272F` | 12.48 | 4.5 | passa |
| texto-2 / folha | `#C5CBD3` | `#20272F` | 9.23 | 4.5 | passa |
| apoio / folha | `#9BA4B0` | `#20272F` | 5.98 | 4.5 | passa |
| título / fundo | `#EAEFF5` | `#0B1016` | 16.51 | 4.5 | passa |
| título / cartão | `#EAEFF5` | `#141921` | 15.25 | 4.5 | passa |
| marca (link) / cartão | `#7DC0EE` | `#141921` | 8.94 | 4.5 | passa |
| marca (link) / fundo | `#7DC0EE` | `#0B1016` | 9.68 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#7DC0EE` | `#17344C` | 6.52 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#091521` | `#6DB3E4` | 8.08 | 4.5 | passa |
| sobre-marca / marca-hover | `#091521` | `#80C3F2` | 9.65 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#EAEFF5` | `#17344C` | 11.13 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#727D8B` | `#141921` | 4.22 | 3 | passa |
| linha-forte / rebaixado | `#727D8B` | `#0E1319` | 4.46 | 3 | passa |
| foco / cartão | `#78C7FD` | `#141921` | 9.56 | 3 | passa |
| foco / fundo | `#78C7FD` | `#0B1016` | 10.35 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#6DB3E4` | `#0B1016` | 8.38 | 3 | passa |
| crit: texto / pílula | `#FFAFAC` | `#451B19` | 8.41 | 4.5 | passa |
| crit: texto / cartão | `#FFAFAC` | `#141921` | 10.06 | 4.5 | passa |
| crit: texto-2 / aviso | `#C5CBD3` | `#451B19` | 9.03 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#0E141D` | `#FDA19E` | 9.48 | 4.5 | passa |
| crit: borda do aviso / cartão | `#A03F3C` | `#141921` | 2.75 | — | info |
| warn: texto / pílula | `#FACD78` | `#3A250B` | 9.71 | 4.5 | passa |
| warn: texto / cartão | `#FACD78` | `#141921` | 11.81 | 4.5 | passa |
| warn: texto-2 / aviso | `#C5CBD3` | `#3A250B` | 8.87 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#0E141D` | `#FAC463` | 11.56 | 4.5 | passa |
| warn: borda do aviso / cartão | `#8C5E1A` | `#141921` | 3.13 | — | info |
| ok: texto / pílula | `#83E5BC` | `#0E2F22` | 9.60 | 4.5 | passa |
| ok: texto / cartão | `#83E5BC` | `#141921` | 11.67 | 4.5 | passa |
| ok: texto-2 / aviso | `#C5CBD3` | `#0E2F22` | 8.88 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#0E141D` | `#69D6AA` | 10.38 | 4.5 | passa |
| ok: borda do aviso / cartão | `#2A7257` | `#141921` | 3.06 | — | info |
| info: texto / pílula | `#AACDFB` | `#182A45` | 8.82 | 4.5 | passa |
| info: texto / cartão | `#AACDFB` | `#141921` | 10.78 | 4.5 | passa |
| info: texto-2 / aviso | `#C5CBD3` | `#182A45` | 8.83 | 4.5 | passa |
| info: sobre-sólido / sólido | `#0E141D` | `#97C1F7` | 9.93 | 4.5 | passa |
| info: borda do aviso / cartão | `#3963A1` | `#141921` | 2.92 | — | info |

### Rosa (rosa-chá com ameixa)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#29141E` | `#FAF2F5` | 15.73 | 4.5 | passa |
| texto-2 / fundo | `#4E3641` | `#FAF2F5` | 9.90 | 4.5 | passa |
| apoio / fundo | `#725A65` | `#FAF2F5` | 5.67 | 4.5 | passa |
| texto / cartao | `#29141E` | `#FFFFFF` | 17.31 | 4.5 | passa |
| texto-2 / cartao | `#4E3641` | `#FFFFFF` | 10.89 | 4.5 | passa |
| apoio / cartao | `#725A65` | `#FFFFFF` | 6.24 | 4.5 | passa |
| texto / rebaixado | `#29141E` | `#F5EAEE` | 14.74 | 4.5 | passa |
| texto-2 / rebaixado | `#4E3641` | `#F5EAEE` | 9.28 | 4.5 | passa |
| apoio / rebaixado | `#725A65` | `#F5EAEE` | 5.31 | 4.5 | passa |
| texto / elevado | `#29141E` | `#FFFFFF` | 17.31 | 4.5 | passa |
| texto-2 / elevado | `#4E3641` | `#FFFFFF` | 10.89 | 4.5 | passa |
| apoio / elevado | `#725A65` | `#FFFFFF` | 6.24 | 4.5 | passa |
| texto / folha | `#29141E` | `#FFFFFF` | 17.31 | 4.5 | passa |
| texto-2 / folha | `#4E3641` | `#FFFFFF` | 10.89 | 4.5 | passa |
| apoio / folha | `#725A65` | `#FFFFFF` | 6.24 | 4.5 | passa |
| título / fundo | `#652545` | `#FAF2F5` | 10.02 | 4.5 | passa |
| título / cartão | `#652545` | `#FFFFFF` | 11.03 | 4.5 | passa |
| marca (link) / cartão | `#8D3060` | `#FFFFFF` | 7.71 | 4.5 | passa |
| marca (link) / fundo | `#8D3060` | `#FAF2F5` | 7.01 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#8D3060` | `#FDE7F0` | 6.56 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#FFFFFF` | `#8D3060` | 7.71 | 4.5 | passa |
| sobre-marca / marca-hover | `#FFFFFF` | `#782450` | 9.69 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#652545` | `#FDE7F0` | 9.38 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#907883` | `#FFFFFF` | 4.04 | 3 | passa |
| linha-forte / rebaixado | `#907883` | `#F5EAEE` | 3.44 | 3 | passa |
| foco / cartão | `#B3417B` | `#FFFFFF` | 5.30 | 3 | passa |
| foco / fundo | `#B3417B` | `#FAF2F5` | 4.82 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#8D3060` | `#FAF2F5` | 7.01 | 3 | passa |
| crit: texto / pílula | `#A91D1D` | `#FFEFEF` | 6.54 | 4.5 | passa |
| crit: texto / cartão | `#A91D1D` | `#FFFFFF` | 7.29 | 4.5 | passa |
| crit: texto-2 / aviso | `#4E3641` | `#FFEFEF` | 9.77 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#FFFFFF` | `#B91C1E` | 6.47 | 4.5 | passa |
| crit: borda do aviso / cartão | `#FBBBB8` | `#FFFFFF` | 1.63 | — | info |
| warn: texto / pílula | `#8C4705` | `#FFF5E0` | 6.42 | 4.5 | passa |
| warn: texto / cartão | `#8C4705` | `#FFFFFF` | 6.96 | 4.5 | passa |
| warn: texto-2 / aviso | `#4E3641` | `#FFF5E0` | 10.06 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#FFFFFF` | `#8C4705` | 6.96 | 4.5 | passa |
| warn: borda do aviso / cartão | `#F4CA89` | `#FFFFFF` | 1.54 | — | info |
| ok: texto / pílula | `#006D4E` | `#E2FBEF` | 5.85 | 4.5 | passa |
| ok: texto / cartão | `#006D4E` | `#FFFFFF` | 6.37 | 4.5 | passa |
| ok: texto-2 / aviso | `#4E3641` | `#E2FBEF` | 10.00 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#FFFFFF` | `#006D4E` | 6.37 | 4.5 | passa |
| ok: borda do aviso / cartão | `#9FDEC2` | `#FFFFFF` | 1.53 | — | info |
| info: texto / pílula | `#2556B4` | `#EBF4FF` | 6.16 | 4.5 | passa |
| info: texto / cartão | `#2556B4` | `#FFFFFF` | 6.84 | 4.5 | passa |
| info: texto-2 / aviso | `#4E3641` | `#EBF4FF` | 9.81 | 4.5 | passa |
| info: sobre-sólido / sólido | `#FFFFFF` | `#2556B4` | 6.84 | 4.5 | passa |
| info: borda do aviso / cartão | `#B6D0F6` | `#FFFFFF` | 1.57 | — | info |

### Azul claro (céu, separado do Claro)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#001F2D` | `#EDF6FA` | 15.53 | 4.5 | passa |
| texto-2 / fundo | `#234352` | `#EDF6FA` | 9.60 | 4.5 | passa |
| apoio / fundo | `#496775` | `#EDF6FA` | 5.51 | 4.5 | passa |
| texto / cartao | `#001F2D` | `#FFFFFF` | 17.02 | 4.5 | passa |
| texto-2 / cartao | `#234352` | `#FFFFFF` | 10.52 | 4.5 | passa |
| apoio / cartao | `#496775` | `#FFFFFF` | 6.03 | 4.5 | passa |
| texto / rebaixado | `#001F2D` | `#E2F0F5` | 14.60 | 4.5 | passa |
| texto-2 / rebaixado | `#234352` | `#E2F0F5` | 9.03 | 4.5 | passa |
| apoio / rebaixado | `#496775` | `#E2F0F5` | 5.18 | 4.5 | passa |
| texto / elevado | `#001F2D` | `#FFFFFF` | 17.02 | 4.5 | passa |
| texto-2 / elevado | `#234352` | `#FFFFFF` | 10.52 | 4.5 | passa |
| apoio / elevado | `#496775` | `#FFFFFF` | 6.03 | 4.5 | passa |
| texto / folha | `#001F2D` | `#FFFFFF` | 17.02 | 4.5 | passa |
| texto-2 / folha | `#234352` | `#FFFFFF` | 10.52 | 4.5 | passa |
| apoio / folha | `#496775` | `#FFFFFF` | 6.03 | 4.5 | passa |
| título / fundo | `#004964` | `#EDF6FA` | 8.97 | 4.5 | passa |
| título / cartão | `#004964` | `#FFFFFF` | 9.83 | 4.5 | passa |
| marca (link) / cartão | `#006787` | `#FFFFFF` | 6.38 | 4.5 | passa |
| marca (link) / fundo | `#006787` | `#EDF6FA` | 5.82 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#006787` | `#D9F3FC` | 5.52 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#FFFFFF` | `#006787` | 6.38 | 4.5 | passa |
| sobre-marca / marca-hover | `#FFFFFF` | `#005572` | 8.26 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#004964` | `#D9F3FC` | 8.51 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#688692` | `#FFFFFF` | 3.88 | 3 | passa |
| linha-forte / rebaixado | `#688692` | `#E2F0F5` | 3.33 | 3 | passa |
| foco / cartão | `#0080A7` | `#FFFFFF` | 4.52 | 3 | passa |
| foco / fundo | `#0080A7` | `#EDF6FA` | 4.13 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#006787` | `#EDF6FA` | 5.82 | 3 | passa |
| crit: texto / pílula | `#A91D1D` | `#FFEFEF` | 6.54 | 4.5 | passa |
| crit: texto / cartão | `#A91D1D` | `#FFFFFF` | 7.29 | 4.5 | passa |
| crit: texto-2 / aviso | `#234352` | `#FFEFEF` | 9.44 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#FFFFFF` | `#B91C1E` | 6.47 | 4.5 | passa |
| crit: borda do aviso / cartão | `#FBBBB8` | `#FFFFFF` | 1.63 | — | info |
| warn: texto / pílula | `#8C4705` | `#FFF5E0` | 6.42 | 4.5 | passa |
| warn: texto / cartão | `#8C4705` | `#FFFFFF` | 6.96 | 4.5 | passa |
| warn: texto-2 / aviso | `#234352` | `#FFF5E0` | 9.71 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#FFFFFF` | `#8C4705` | 6.96 | 4.5 | passa |
| warn: borda do aviso / cartão | `#F4CA89` | `#FFFFFF` | 1.54 | — | info |
| ok: texto / pílula | `#006D4E` | `#E2FBEF` | 5.85 | 4.5 | passa |
| ok: texto / cartão | `#006D4E` | `#FFFFFF` | 6.37 | 4.5 | passa |
| ok: texto-2 / aviso | `#234352` | `#E2FBEF` | 9.66 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#FFFFFF` | `#006D4E` | 6.37 | 4.5 | passa |
| ok: borda do aviso / cartão | `#9FDEC2` | `#FFFFFF` | 1.53 | — | info |
| info: texto / pílula | `#2556B4` | `#EBF4FF` | 6.16 | 4.5 | passa |
| info: texto / cartão | `#2556B4` | `#FFFFFF` | 6.84 | 4.5 | passa |
| info: texto-2 / aviso | `#234352` | `#EBF4FF` | 9.48 | 4.5 | passa |
| info: sobre-sólido / sólido | `#FFFFFF` | `#2556B4` | 6.84 | 4.5 | passa |
| info: borda do aviso / cartão | `#B6D0F6` | `#FFFFFF` | 1.57 | — | info |

### Verde (sálvia e mata)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#0D2112` | `#F1F6F0` | 15.43 | 4.5 | passa |
| texto-2 / fundo | `#304434` | `#F1F6F0` | 9.58 | 4.5 | passa |
| apoio / fundo | `#546857` | `#F1F6F0` | 5.49 | 4.5 | passa |
| texto / cartao | `#0D2112` | `#FFFFFF` | 16.89 | 4.5 | passa |
| texto-2 / cartao | `#304434` | `#FFFFFF` | 10.49 | 4.5 | passa |
| apoio / cartao | `#546857` | `#FFFFFF` | 6.01 | 4.5 | passa |
| texto / rebaixado | `#0D2112` | `#E8F0E7` | 14.52 | 4.5 | passa |
| texto-2 / rebaixado | `#304434` | `#E8F0E7` | 9.02 | 4.5 | passa |
| apoio / rebaixado | `#546857` | `#E8F0E7` | 5.16 | 4.5 | passa |
| texto / elevado | `#0D2112` | `#FFFFFF` | 16.89 | 4.5 | passa |
| texto-2 / elevado | `#304434` | `#FFFFFF` | 10.49 | 4.5 | passa |
| apoio / elevado | `#546857` | `#FFFFFF` | 6.01 | 4.5 | passa |
| texto / folha | `#0D2112` | `#FFFFFF` | 16.89 | 4.5 | passa |
| texto-2 / folha | `#304434` | `#FFFFFF` | 10.49 | 4.5 | passa |
| apoio / folha | `#546857` | `#FFFFFF` | 6.01 | 4.5 | passa |
| título / fundo | `#1D4825` | `#F1F6F0` | 9.56 | 4.5 | passa |
| título / cartão | `#1D4825` | `#FFFFFF` | 10.47 | 4.5 | passa |
| marca (link) / cartão | `#33642E` | `#FFFFFF` | 6.99 | 4.5 | passa |
| marca (link) / fundo | `#33642E` | `#F1F6F0` | 6.39 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#33642E` | `#E4F4E1` | 6.10 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#FFFFFF` | `#33642E` | 6.99 | 4.5 | passa |
| sobre-marca / marca-hover | `#FFFFFF` | `#265421` | 8.85 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#1D4825` | `#E4F4E1` | 9.14 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#768573` | `#FFFFFF` | 3.91 | 3 | passa |
| linha-forte / rebaixado | `#768573` | `#E8F0E7` | 3.36 | 3 | passa |
| foco / cartão | `#3F8439` | `#FFFFFF` | 4.59 | 3 | passa |
| foco / fundo | `#3F8439` | `#F1F6F0` | 4.20 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#33642E` | `#F1F6F0` | 6.39 | 3 | passa |
| crit: texto / pílula | `#A91D1D` | `#FFEFEF` | 6.54 | 4.5 | passa |
| crit: texto / cartão | `#A91D1D` | `#FFFFFF` | 7.29 | 4.5 | passa |
| crit: texto-2 / aviso | `#304434` | `#FFEFEF` | 9.41 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#FFFFFF` | `#B91C1E` | 6.47 | 4.5 | passa |
| crit: borda do aviso / cartão | `#FBBBB8` | `#FFFFFF` | 1.63 | — | info |
| warn: texto / pílula | `#8C4705` | `#FFF5E0` | 6.42 | 4.5 | passa |
| warn: texto / cartão | `#8C4705` | `#FFFFFF` | 6.96 | 4.5 | passa |
| warn: texto-2 / aviso | `#304434` | `#FFF5E0` | 9.68 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#FFFFFF` | `#8C4705` | 6.96 | 4.5 | passa |
| warn: borda do aviso / cartão | `#F4CA89` | `#FFFFFF` | 1.54 | — | info |
| ok: texto / pílula | `#006D4E` | `#E2FBEF` | 5.85 | 4.5 | passa |
| ok: texto / cartão | `#006D4E` | `#FFFFFF` | 6.37 | 4.5 | passa |
| ok: texto-2 / aviso | `#304434` | `#E2FBEF` | 9.63 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#FFFFFF` | `#006D4E` | 6.37 | 4.5 | passa |
| ok: borda do aviso / cartão | `#9FDEC2` | `#FFFFFF` | 1.53 | — | info |
| info: texto / pílula | `#2556B4` | `#EBF4FF` | 6.16 | 4.5 | passa |
| info: texto / cartão | `#2556B4` | `#FFFFFF` | 6.84 | 4.5 | passa |
| info: texto-2 / aviso | `#304434` | `#EBF4FF` | 9.45 | 4.5 | passa |
| info: sobre-sólido / sólido | `#FFFFFF` | `#2556B4` | 6.84 | 4.5 | passa |
| info: borda do aviso / cartão | `#B6D0F6` | `#FFFFFF` | 1.57 | — | info |

### Colorido (lilás de base, cor nas portas)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#1E182A` | `#F5F3FA` | 15.65 | 4.5 | passa |
| texto-2 / fundo | `#413A4E` | `#F5F3FA` | 9.84 | 4.5 | passa |
| apoio / fundo | `#645E72` | `#F5F3FA` | 5.64 | 4.5 | passa |
| texto / cartao | `#1E182A` | `#FFFFFF` | 17.22 | 4.5 | passa |
| texto-2 / cartao | `#413A4E` | `#FFFFFF` | 10.82 | 4.5 | passa |
| apoio / cartao | `#645E72` | `#FFFFFF` | 6.20 | 4.5 | passa |
| texto / rebaixado | `#1E182A` | `#EEEBF5` | 14.63 | 4.5 | passa |
| texto-2 / rebaixado | `#413A4E` | `#EEEBF5` | 9.19 | 4.5 | passa |
| apoio / rebaixado | `#645E72` | `#EEEBF5` | 5.27 | 4.5 | passa |
| texto / elevado | `#1E182A` | `#FFFFFF` | 17.22 | 4.5 | passa |
| texto-2 / elevado | `#413A4E` | `#FFFFFF` | 10.82 | 4.5 | passa |
| apoio / elevado | `#645E72` | `#FFFFFF` | 6.20 | 4.5 | passa |
| texto / folha | `#1E182A` | `#FFFFFF` | 17.22 | 4.5 | passa |
| texto-2 / folha | `#413A4E` | `#FFFFFF` | 10.82 | 4.5 | passa |
| apoio / folha | `#645E72` | `#FFFFFF` | 6.20 | 4.5 | passa |
| título / fundo | `#4A2292` | `#F5F3FA` | 9.86 | 4.5 | passa |
| título / cartão | `#4A2292` | `#FFFFFF` | 10.85 | 4.5 | passa |
| marca (link) / cartão | `#6738C1` | `#FFFFFF` | 7.21 | 4.5 | passa |
| marca (link) / fundo | `#6738C1` | `#F5F3FA` | 6.55 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#6738C1` | `#F1EBFF` | 6.20 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#FFFFFF` | `#6738C1` | 7.21 | 4.5 | passa |
| sobre-marca / marca-hover | `#FFFFFF` | `#5627A8` | 9.33 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#4A2292` | `#F1EBFF` | 9.34 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#837C90` | `#FFFFFF` | 4.00 | 3 | passa |
| linha-forte / rebaixado | `#837C90` | `#EEEBF5` | 3.40 | 3 | passa |
| foco / cartão | `#7A4FD9` | `#FFFFFF` | 5.32 | 3 | passa |
| foco / fundo | `#7A4FD9` | `#F5F3FA` | 4.83 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#6738C1` | `#F5F3FA` | 6.55 | 3 | passa |
| crit: texto / pílula | `#A91D1D` | `#FFEFEF` | 6.54 | 4.5 | passa |
| crit: texto / cartão | `#A91D1D` | `#FFFFFF` | 7.29 | 4.5 | passa |
| crit: texto-2 / aviso | `#413A4E` | `#FFEFEF` | 9.71 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#FFFFFF` | `#B91C1E` | 6.47 | 4.5 | passa |
| crit: borda do aviso / cartão | `#FBBBB8` | `#FFFFFF` | 1.63 | — | info |
| warn: texto / pílula | `#8C4705` | `#FFF5E0` | 6.42 | 4.5 | passa |
| warn: texto / cartão | `#8C4705` | `#FFFFFF` | 6.96 | 4.5 | passa |
| warn: texto-2 / aviso | `#413A4E` | `#FFF5E0` | 9.99 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#FFFFFF` | `#8C4705` | 6.96 | 4.5 | passa |
| warn: borda do aviso / cartão | `#F4CA89` | `#FFFFFF` | 1.54 | — | info |
| ok: texto / pílula | `#006D4E` | `#E2FBEF` | 5.85 | 4.5 | passa |
| ok: texto / cartão | `#006D4E` | `#FFFFFF` | 6.37 | 4.5 | passa |
| ok: texto-2 / aviso | `#413A4E` | `#E2FBEF` | 9.94 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#FFFFFF` | `#006D4E` | 6.37 | 4.5 | passa |
| ok: borda do aviso / cartão | `#9FDEC2` | `#FFFFFF` | 1.53 | — | info |
| info: texto / pílula | `#2556B4` | `#EBF4FF` | 6.16 | 4.5 | passa |
| info: texto / cartão | `#2556B4` | `#FFFFFF` | 6.84 | 4.5 | passa |
| info: texto-2 / aviso | `#413A4E` | `#EBF4FF` | 9.75 | 4.5 | passa |
| info: sobre-sólido / sólido | `#FFFFFF` | `#2556B4` | 6.84 | 4.5 | passa |
| info: borda do aviso / cartão | `#B6D0F6` | `#FFFFFF` | 1.57 | — | info |

### Rio Grande do Sul (campo e bandeira)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#102010` | `#F2F6EF` | 15.54 | 4.5 | passa |
| texto-2 / fundo | `#324432` | `#F2F6EF` | 9.56 | 4.5 | passa |
| apoio / fundo | `#566756` | `#F2F6EF` | 5.53 | 4.5 | passa |
| texto / cartao | `#102010` | `#FFFFFF` | 16.99 | 4.5 | passa |
| texto-2 / cartao | `#324432` | `#FFFFFF` | 10.46 | 4.5 | passa |
| apoio / cartao | `#566756` | `#FFFFFF` | 6.05 | 4.5 | passa |
| texto / rebaixado | `#102010` | `#EAEFE6` | 14.55 | 4.5 | passa |
| texto-2 / rebaixado | `#324432` | `#EAEFE6` | 8.96 | 4.5 | passa |
| apoio / rebaixado | `#566756` | `#EAEFE6` | 5.18 | 4.5 | passa |
| texto / elevado | `#102010` | `#FFFFFF` | 16.99 | 4.5 | passa |
| texto-2 / elevado | `#324432` | `#FFFFFF` | 10.46 | 4.5 | passa |
| apoio / elevado | `#566756` | `#FFFFFF` | 6.05 | 4.5 | passa |
| texto / folha | `#102010` | `#FFFFFF` | 16.99 | 4.5 | passa |
| texto-2 / folha | `#324432` | `#FFFFFF` | 10.46 | 4.5 | passa |
| apoio / folha | `#566756` | `#FFFFFF` | 6.05 | 4.5 | passa |
| título / fundo | `#114C24` | `#F2F6EF` | 9.22 | 4.5 | passa |
| título / cartão | `#114C24` | `#FFFFFF` | 10.08 | 4.5 | passa |
| marca (link) / cartão | `#0B6729` | `#FFFFFF` | 7.03 | 4.5 | passa |
| marca (link) / fundo | `#0B6729` | `#F2F6EF` | 6.43 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#0B6729` | `#E3F4E2` | 6.13 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#FFFFFF` | `#0B6729` | 7.03 | 4.5 | passa |
| sobre-marca / marca-hover | `#FFFFFF` | `#00561E` | 8.94 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#114C24` | `#E3F4E2` | 8.79 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#7A8470` | `#FFFFFF` | 3.92 | 3 | passa |
| linha-forte / rebaixado | `#7A8470` | `#EAEFE6` | 3.35 | 3 | passa |
| foco / cartão | `#18883A` | `#FFFFFF` | 4.54 | 3 | passa |
| foco / fundo | `#18883A` | `#F2F6EF` | 4.16 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#0B6729` | `#F2F6EF` | 6.43 | 3 | passa |
| crit: texto / pílula | `#A91D1D` | `#FFEFEF` | 6.54 | 4.5 | passa |
| crit: texto / cartão | `#A91D1D` | `#FFFFFF` | 7.29 | 4.5 | passa |
| crit: texto-2 / aviso | `#324432` | `#FFEFEF` | 9.38 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#FFFFFF` | `#B91C1E` | 6.47 | 4.5 | passa |
| crit: borda do aviso / cartão | `#FBBBB8` | `#FFFFFF` | 1.63 | — | info |
| warn: texto / pílula | `#8C4705` | `#FFF5E0` | 6.42 | 4.5 | passa |
| warn: texto / cartão | `#8C4705` | `#FFFFFF` | 6.96 | 4.5 | passa |
| warn: texto-2 / aviso | `#324432` | `#FFF5E0` | 9.65 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#FFFFFF` | `#8C4705` | 6.96 | 4.5 | passa |
| warn: borda do aviso / cartão | `#F4CA89` | `#FFFFFF` | 1.54 | — | info |
| ok: texto / pílula | `#006D4E` | `#E2FBEF` | 5.85 | 4.5 | passa |
| ok: texto / cartão | `#006D4E` | `#FFFFFF` | 6.37 | 4.5 | passa |
| ok: texto-2 / aviso | `#324432` | `#E2FBEF` | 9.60 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#FFFFFF` | `#006D4E` | 6.37 | 4.5 | passa |
| ok: borda do aviso / cartão | `#9FDEC2` | `#FFFFFF` | 1.53 | — | info |
| info: texto / pílula | `#2556B4` | `#EBF4FF` | 6.16 | 4.5 | passa |
| info: texto / cartão | `#2556B4` | `#FFFFFF` | 6.84 | 4.5 | passa |
| info: texto-2 / aviso | `#324432` | `#EBF4FF` | 9.42 | 4.5 | passa |
| info: sobre-sólido / sólido | `#FFFFFF` | `#2556B4` | 6.84 | 4.5 | passa |
| info: borda do aviso / cartão | `#B6D0F6` | `#FFFFFF` | 1.57 | — | info |

### rosa-escuro (o escuro da noite desta cor)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#EEE7EA` | `#140D10` | 15.76 | 4.5 | passa |
| texto-2 / fundo | `#D2C7CC` | `#140D10` | 11.67 | 4.5 | passa |
| apoio / fundo | `#AE9EA5` | `#140D10` | 7.52 | 4.5 | passa |
| texto / cartao | `#EEE7EA` | `#1F161A` | 14.52 | 4.5 | passa |
| texto-2 / cartao | `#D2C7CC` | `#1F161A` | 10.76 | 4.5 | passa |
| apoio / cartao | `#AE9EA5` | `#1F161A` | 6.93 | 4.5 | passa |
| texto / rebaixado | `#EEE7EA` | `#181014` | 15.36 | 4.5 | passa |
| texto-2 / rebaixado | `#D2C7CC` | `#181014` | 11.38 | 4.5 | passa |
| apoio / rebaixado | `#AE9EA5` | `#181014` | 7.33 | 4.5 | passa |
| texto / elevado | `#EEE7EA` | `#281D22` | 13.38 | 4.5 | passa |
| texto-2 / elevado | `#D2C7CC` | `#281D22` | 9.92 | 4.5 | passa |
| apoio / elevado | `#AE9EA5` | `#281D22` | 6.39 | 4.5 | passa |
| texto / folha | `#EEE7EA` | `#2D2227` | 12.60 | 4.5 | passa |
| texto-2 / folha | `#D2C7CC` | `#2D2227` | 9.33 | 4.5 | passa |
| apoio / folha | `#AE9EA5` | `#2D2227` | 6.01 | 4.5 | passa |
| título / fundo | `#F4ECEF` | `#140D10` | 16.52 | 4.5 | passa |
| título / cartão | `#F4ECEF` | `#1F161A` | 15.23 | 4.5 | passa |
| marca (link) / cartão | `#EFA9C7` | `#1F161A` | 9.40 | 4.5 | passa |
| marca (link) / fundo | `#EFA9C7` | `#140D10` | 10.20 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#EFA9C7` | `#452734` | 7.01 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#1E0E16` | `#DB96B4` | 8.00 | 4.5 | passa |
| sobre-marca / marca-hover | `#1E0E16` | `#EFA9C7` | 9.89 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#F4ECEF` | `#452734` | 11.36 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#88767E` | `#1F161A` | 4.16 | 3 | passa |
| linha-forte / rebaixado | `#88767E` | `#181014` | 4.40 | 3 | passa |
| foco / cartão | `#F7A9CB` | `#1F161A` | 9.67 | 3 | passa |
| foco / fundo | `#F7A9CB` | `#140D10` | 10.50 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#DB96B4` | `#140D10` | 8.25 | 3 | passa |
| crit: texto / pílula | `#FFAFAC` | `#451B19` | 8.41 | 4.5 | passa |
| crit: texto / cartão | `#FFAFAC` | `#1F161A` | 10.08 | 4.5 | passa |
| crit: texto-2 / aviso | `#D2C7CC` | `#451B19` | 8.98 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#0E141D` | `#FDA19E` | 9.48 | 4.5 | passa |
| crit: borda do aviso / cartão | `#A03F3C` | `#1F161A` | 2.75 | — | info |
| warn: texto / pílula | `#FACD78` | `#3A250B` | 9.71 | 4.5 | passa |
| warn: texto / cartão | `#FACD78` | `#1F161A` | 11.84 | 4.5 | passa |
| warn: texto-2 / aviso | `#D2C7CC` | `#3A250B` | 8.82 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#0E141D` | `#FAC463` | 11.56 | 4.5 | passa |
| warn: borda do aviso / cartão | `#8C5E1A` | `#1F161A` | 3.14 | — | info |
| ok: texto / pílula | `#83E5BC` | `#0E2F22` | 9.60 | 4.5 | passa |
| ok: texto / cartão | `#83E5BC` | `#1F161A` | 11.70 | 4.5 | passa |
| ok: texto-2 / aviso | `#D2C7CC` | `#0E2F22` | 8.82 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#0E141D` | `#69D6AA` | 10.38 | 4.5 | passa |
| ok: borda do aviso / cartão | `#2A7257` | `#1F161A` | 3.07 | — | info |
| info: texto / pílula | `#AACDFB` | `#182A45` | 8.82 | 4.5 | passa |
| info: texto / cartão | `#AACDFB` | `#1F161A` | 10.80 | 4.5 | passa |
| info: texto-2 / aviso | `#D2C7CC` | `#182A45` | 8.78 | 4.5 | passa |
| info: sobre-sólido / sólido | `#0E141D` | `#97C1F7` | 9.93 | 4.5 | passa |
| info: borda do aviso / cartão | `#3963A1` | `#1F161A` | 2.92 | — | info |

### azul-escuro (o escuro da noite desta cor)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#E4EBEE` | `#091114` | 15.81 | 4.5 | passa |
| texto-2 / fundo | `#C2CCD2` | `#091114` | 11.67 | 4.5 | passa |
| apoio / fundo | `#97A6AD` | `#091114` | 7.60 | 4.5 | passa |
| texto / cartao | `#E4EBEE` | `#101A1F` | 14.64 | 4.5 | passa |
| texto-2 / cartao | `#C2CCD2` | `#101A1F` | 10.81 | 4.5 | passa |
| apoio / cartao | `#97A6AD` | `#101A1F` | 7.04 | 4.5 | passa |
| texto / rebaixado | `#E4EBEE` | `#0B1418` | 15.45 | 4.5 | passa |
| texto-2 / rebaixado | `#C2CCD2` | `#0B1418` | 11.41 | 4.5 | passa |
| apoio / rebaixado | `#97A6AD` | `#0B1418` | 7.43 | 4.5 | passa |
| texto / elevado | `#E4EBEE` | `#172328` | 13.32 | 4.5 | passa |
| texto-2 / elevado | `#C2CCD2` | `#172328` | 9.84 | 4.5 | passa |
| apoio / elevado | `#97A6AD` | `#172328` | 6.40 | 4.5 | passa |
| texto / folha | `#E4EBEE` | `#1C282D` | 12.52 | 4.5 | passa |
| texto-2 / folha | `#C2CCD2` | `#1C282D` | 9.25 | 4.5 | passa |
| apoio / folha | `#97A6AD` | `#1C282D` | 6.02 | 4.5 | passa |
| título / fundo | `#E8F0F4` | `#091114` | 16.52 | 4.5 | passa |
| título / cartão | `#E8F0F4` | `#101A1F` | 15.30 | 4.5 | passa |
| marca (link) / cartão | `#82CDEA` | `#101A1F` | 9.98 | 4.5 | passa |
| marca (link) / fundo | `#82CDEA` | `#091114` | 10.77 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#82CDEA` | `#0F3745` | 7.18 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#04161E` | `#6FBAD7` | 8.50 | 4.5 | passa |
| sobre-marca / marca-hover | `#04161E` | `#82CDEA` | 10.42 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#E8F0F4` | `#0F3745` | 11.01 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#6D7F88` | `#101A1F` | 4.24 | 3 | passa |
| linha-forte / rebaixado | `#6D7F88` | `#0B1418` | 4.47 | 3 | passa |
| foco / cartão | `#7CD1F3` | `#101A1F` | 10.32 | 3 | passa |
| foco / fundo | `#7CD1F3` | `#091114` | 11.14 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#6FBAD7` | `#091114` | 8.79 | 3 | passa |
| crit: texto / pílula | `#FFAFAC` | `#451B19` | 8.41 | 4.5 | passa |
| crit: texto / cartão | `#FFAFAC` | `#101A1F` | 10.07 | 4.5 | passa |
| crit: texto-2 / aviso | `#C2CCD2` | `#451B19` | 9.03 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#0E141D` | `#FDA19E` | 9.48 | 4.5 | passa |
| crit: borda do aviso / cartão | `#A03F3C` | `#101A1F` | 2.75 | — | info |
| warn: texto / pílula | `#FACD78` | `#3A250B` | 9.71 | 4.5 | passa |
| warn: texto / cartão | `#FACD78` | `#101A1F` | 11.83 | 4.5 | passa |
| warn: texto-2 / aviso | `#C2CCD2` | `#3A250B` | 8.87 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#0E141D` | `#FAC463` | 11.56 | 4.5 | passa |
| warn: borda do aviso / cartão | `#8C5E1A` | `#101A1F` | 3.14 | — | info |
| ok: texto / pílula | `#83E5BC` | `#0E2F22` | 9.60 | 4.5 | passa |
| ok: texto / cartão | `#83E5BC` | `#101A1F` | 11.68 | 4.5 | passa |
| ok: texto-2 / aviso | `#C2CCD2` | `#0E2F22` | 8.88 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#0E141D` | `#69D6AA` | 10.38 | 4.5 | passa |
| ok: borda do aviso / cartão | `#2A7257` | `#101A1F` | 3.06 | — | info |
| info: texto / pílula | `#AACDFB` | `#182A45` | 8.82 | 4.5 | passa |
| info: texto / cartão | `#AACDFB` | `#101A1F` | 10.79 | 4.5 | passa |
| info: texto-2 / aviso | `#C2CCD2` | `#182A45` | 8.83 | 4.5 | passa |
| info: sobre-sólido / sólido | `#0E141D` | `#97C1F7` | 9.93 | 4.5 | passa |
| info: borda do aviso / cartão | `#3963A1` | `#101A1F` | 2.92 | — | info |

### verde-escuro (o escuro da noite desta cor)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#E6EBE6` | `#0B110C` | 15.81 | 4.5 | passa |
| texto-2 / fundo | `#C5CDC6` | `#0B110C` | 11.75 | 4.5 | passa |
| apoio / fundo | `#9BA79C` | `#0B110C` | 7.64 | 4.5 | passa |
| texto / cartao | `#E6EBE6` | `#131B15` | 14.55 | 4.5 | passa |
| texto-2 / cartao | `#C5CDC6` | `#131B15` | 10.81 | 4.5 | passa |
| apoio / cartao | `#9BA79C` | `#131B15` | 7.03 | 4.5 | passa |
| texto / rebaixado | `#E6EBE6` | `#0E150F` | 15.35 | 4.5 | passa |
| texto-2 / rebaixado | `#C5CDC6` | `#0E150F` | 11.41 | 4.5 | passa |
| apoio / rebaixado | `#9BA79C` | `#0E150F` | 7.42 | 4.5 | passa |
| texto / elevado | `#E6EBE6` | `#1A231C` | 13.37 | 4.5 | passa |
| texto-2 / elevado | `#C5CDC6` | `#1A231C` | 9.93 | 4.5 | passa |
| apoio / elevado | `#9BA79C` | `#1A231C` | 6.46 | 4.5 | passa |
| texto / folha | `#E6EBE6` | `#202921` | 12.42 | 4.5 | passa |
| texto-2 / folha | `#C5CDC6` | `#202921` | 9.23 | 4.5 | passa |
| apoio / folha | `#9BA79C` | `#202921` | 6.00 | 4.5 | passa |
| título / fundo | `#EAF0EB` | `#0B110C` | 16.52 | 4.5 | passa |
| título / cartão | `#EAF0EB` | `#131B15` | 15.19 | 4.5 | passa |
| marca (link) / cartão | `#98D299` | `#131B15` | 10.05 | 4.5 | passa |
| marca (link) / fundo | `#98D299` | `#0B110C` | 10.92 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#98D299` | `#213821` | 7.27 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#09180C` | `#85BF86` | 8.53 | 4.5 | passa |
| sobre-marca / marca-hover | `#09180C` | `#98D299` | 10.47 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#EAF0EB` | `#213821` | 10.99 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#728074` | `#131B15` | 4.23 | 3 | passa |
| linha-forte / rebaixado | `#728074` | `#0E150F` | 4.46 | 3 | passa |
| foco / cartão | `#96D798` | `#131B15` | 10.43 | 3 | passa |
| foco / fundo | `#96D798` | `#0B110C` | 11.34 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#85BF86` | `#0B110C` | 8.91 | 3 | passa |
| crit: texto / pílula | `#FFAFAC` | `#451B19` | 8.41 | 4.5 | passa |
| crit: texto / cartão | `#FFAFAC` | `#131B15` | 10.02 | 4.5 | passa |
| crit: texto-2 / aviso | `#C5CDC6` | `#451B19` | 9.08 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#0E141D` | `#FDA19E` | 9.48 | 4.5 | passa |
| crit: borda do aviso / cartão | `#A03F3C` | `#131B15` | 2.74 | — | info |
| warn: texto / pílula | `#FACD78` | `#3A250B` | 9.71 | 4.5 | passa |
| warn: texto / cartão | `#FACD78` | `#131B15` | 11.77 | 4.5 | passa |
| warn: texto-2 / aviso | `#C5CDC6` | `#3A250B` | 8.92 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#0E141D` | `#FAC463` | 11.56 | 4.5 | passa |
| warn: borda do aviso / cartão | `#8C5E1A` | `#131B15` | 3.12 | — | info |
| ok: texto / pílula | `#83E5BC` | `#0E2F22` | 9.60 | 4.5 | passa |
| ok: texto / cartão | `#83E5BC` | `#131B15` | 11.63 | 4.5 | passa |
| ok: texto-2 / aviso | `#C5CDC6` | `#0E2F22` | 8.92 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#0E141D` | `#69D6AA` | 10.38 | 4.5 | passa |
| ok: borda do aviso / cartão | `#2A7257` | `#131B15` | 3.05 | — | info |
| info: texto / pílula | `#AACDFB` | `#182A45` | 8.82 | 4.5 | passa |
| info: texto / cartão | `#AACDFB` | `#131B15` | 10.74 | 4.5 | passa |
| info: texto-2 / aviso | `#C5CDC6` | `#182A45` | 8.88 | 4.5 | passa |
| info: sobre-sólido / sólido | `#0E141D` | `#97C1F7` | 9.93 | 4.5 | passa |
| info: borda do aviso / cartão | `#3963A1` | `#131B15` | 2.91 | — | info |

### colorido-escuro (o escuro da noite desta cor)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#EAE8EF` | `#100E15` | 15.78 | 4.5 | passa |
| texto-2 / fundo | `#CBC9D3` | `#100E15` | 11.71 | 4.5 | passa |
| apoio / fundo | `#A4A1AF` | `#100E15` | 7.57 | 4.5 | passa |
| texto / cartao | `#EAE8EF` | `#191720` | 14.59 | 4.5 | passa |
| texto-2 / cartao | `#CBC9D3` | `#191720` | 10.83 | 4.5 | passa |
| apoio / cartao | `#A4A1AF` | `#191720` | 7.00 | 4.5 | passa |
| texto / rebaixado | `#EAE8EF` | `#131119` | 15.41 | 4.5 | passa |
| texto-2 / rebaixado | `#CBC9D3` | `#131119` | 11.44 | 4.5 | passa |
| apoio / rebaixado | `#A4A1AF` | `#131119` | 7.39 | 4.5 | passa |
| texto / elevado | `#EAE8EF` | `#211F29` | 13.37 | 4.5 | passa |
| texto-2 / elevado | `#CBC9D3` | `#211F29` | 9.93 | 4.5 | passa |
| apoio / elevado | `#A4A1AF` | `#211F29` | 6.42 | 4.5 | passa |
| texto / folha | `#EAE8EF` | `#26242E` | 12.58 | 4.5 | passa |
| texto-2 / folha | `#CBC9D3` | `#26242E` | 9.34 | 4.5 | passa |
| apoio / folha | `#A4A1AF` | `#26242E` | 6.04 | 4.5 | passa |
| título / fundo | `#EFEDF5` | `#100E15` | 16.52 | 4.5 | passa |
| título / cartão | `#EFEDF5` | `#191720` | 15.28 | 4.5 | passa |
| marca (link) / cartão | `#C0B0FE` | `#191720` | 9.19 | 4.5 | passa |
| marca (link) / fundo | `#C0B0FE` | `#100E15` | 9.93 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#C0B0FE` | `#322D49` | 6.77 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#151120` | `#AD9DEA` | 7.76 | 4.5 | passa |
| sobre-marca / marca-hover | `#151120` | `#C0B0FE` | 9.61 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#EFEDF5` | `#322D49` | 11.26 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#7C798A` | `#191720` | 4.19 | 3 | passa |
| linha-forte / rebaixado | `#7C798A` | `#131119` | 4.42 | 3 | passa |
| foco / cartão | `#C3B4FF` | `#191720` | 9.53 | 3 | passa |
| foco / fundo | `#C3B4FF` | `#100E15` | 10.31 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#AD9DEA` | `#100E15` | 8.02 | 3 | passa |
| crit: texto / pílula | `#FFAFAC` | `#451B19` | 8.41 | 4.5 | passa |
| crit: texto / cartão | `#FFAFAC` | `#191720` | 10.11 | 4.5 | passa |
| crit: texto-2 / aviso | `#CBC9D3` | `#451B19` | 9.01 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#0E141D` | `#FDA19E` | 9.48 | 4.5 | passa |
| crit: borda do aviso / cartão | `#A03F3C` | `#191720` | 2.76 | — | info |
| warn: texto / pílula | `#FACD78` | `#3A250B` | 9.71 | 4.5 | passa |
| warn: texto / cartão | `#FACD78` | `#191720` | 11.87 | 4.5 | passa |
| warn: texto-2 / aviso | `#CBC9D3` | `#3A250B` | 8.86 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#0E141D` | `#FAC463` | 11.56 | 4.5 | passa |
| warn: borda do aviso / cartão | `#8C5E1A` | `#191720` | 3.15 | — | info |
| ok: texto / pílula | `#83E5BC` | `#0E2F22` | 9.60 | 4.5 | passa |
| ok: texto / cartão | `#83E5BC` | `#191720` | 11.73 | 4.5 | passa |
| ok: texto-2 / aviso | `#CBC9D3` | `#0E2F22` | 8.86 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#0E141D` | `#69D6AA` | 10.38 | 4.5 | passa |
| ok: borda do aviso / cartão | `#2A7257` | `#191720` | 3.07 | — | info |
| info: texto / pílula | `#AACDFB` | `#182A45` | 8.82 | 4.5 | passa |
| info: texto / cartão | `#AACDFB` | `#191720` | 10.83 | 4.5 | passa |
| info: texto-2 / aviso | `#CBC9D3` | `#182A45` | 8.82 | 4.5 | passa |
| info: sobre-sólido / sólido | `#0E141D` | `#97C1F7` | 9.93 | 4.5 | passa |
| info: borda do aviso / cartão | `#3963A1` | `#191720` | 2.93 | — | info |

### rs-escuro (o escuro da noite desta cor)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#E6EBE6` | `#0C110C` | 15.79 | 4.5 | passa |
| texto-2 / fundo | `#C5CDC5` | `#0C110C` | 11.73 | 4.5 | passa |
| apoio / fundo | `#9CA79B` | `#0C110C` | 7.64 | 4.5 | passa |
| texto / cartao | `#E6EBE6` | `#141B14` | 14.53 | 4.5 | passa |
| texto-2 / cartao | `#C5CDC5` | `#141B14` | 10.79 | 4.5 | passa |
| apoio / cartao | `#9CA79B` | `#141B14` | 7.03 | 4.5 | passa |
| texto / rebaixado | `#E6EBE6` | `#0E150F` | 15.35 | 4.5 | passa |
| texto-2 / rebaixado | `#C5CDC5` | `#0E150F` | 11.40 | 4.5 | passa |
| apoio / rebaixado | `#9CA79B` | `#0E150F` | 7.43 | 4.5 | passa |
| texto / elevado | `#E6EBE6` | `#1B231B` | 13.35 | 4.5 | passa |
| texto-2 / elevado | `#C5CDC5` | `#1B231B` | 9.91 | 4.5 | passa |
| apoio / elevado | `#9CA79B` | `#1B231B` | 6.46 | 4.5 | passa |
| texto / folha | `#E6EBE6` | `#202820` | 12.55 | 4.5 | passa |
| texto-2 / folha | `#C5CDC5` | `#202820` | 9.32 | 4.5 | passa |
| apoio / folha | `#9CA79B` | `#202820` | 6.07 | 4.5 | passa |
| título / fundo | `#EAF0EA` | `#0C110C` | 16.48 | 4.5 | passa |
| título / cartão | `#EAF0EA` | `#141B14` | 15.17 | 4.5 | passa |
| marca (link) / cartão | `#86D391` | `#141B14` | 9.81 | 4.5 | passa |
| marca (link) / fundo | `#86D391` | `#0C110C` | 10.66 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#86D391` | `#1F3923` | 7.04 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#0B170B` | `#73C07F` | 8.39 | 4.5 | passa |
| sobre-marca / marca-hover | `#0B170B` | `#86D391` | 10.28 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#EAF0EA` | `#1F3923` | 10.88 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#738073` | `#141B14` | 4.23 | 3 | passa |
| linha-forte / rebaixado | `#738073` | `#0E150F` | 4.47 | 3 | passa |
| foco / cartão | `#83D890` | `#141B14` | 10.19 | 3 | passa |
| foco / fundo | `#83D890` | `#0C110C` | 11.07 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#73C07F` | `#0C110C` | 8.70 | 3 | passa |
| crit: texto / pílula | `#FFAFAC` | `#451B19` | 8.41 | 4.5 | passa |
| crit: texto / cartão | `#FFAFAC` | `#141B14` | 10.01 | 4.5 | passa |
| crit: texto-2 / aviso | `#C5CDC5` | `#451B19` | 9.07 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#0E141D` | `#FDA19E` | 9.48 | 4.5 | passa |
| crit: borda do aviso / cartão | `#A03F3C` | `#141B14` | 2.73 | — | info |
| warn: texto / pílula | `#FACD78` | `#3A250B` | 9.71 | 4.5 | passa |
| warn: texto / cartão | `#FACD78` | `#141B14` | 11.76 | 4.5 | passa |
| warn: texto-2 / aviso | `#C5CDC5` | `#3A250B` | 8.91 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#0E141D` | `#FAC463` | 11.56 | 4.5 | passa |
| warn: borda do aviso / cartão | `#8C5E1A` | `#141B14` | 3.12 | — | info |
| ok: texto / pílula | `#83E5BC` | `#0E2F22` | 9.60 | 4.5 | passa |
| ok: texto / cartão | `#83E5BC` | `#141B14` | 11.62 | 4.5 | passa |
| ok: texto-2 / aviso | `#C5CDC5` | `#0E2F22` | 8.92 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#0E141D` | `#69D6AA` | 10.38 | 4.5 | passa |
| ok: borda do aviso / cartão | `#2A7257` | `#141B14` | 3.04 | — | info |
| info: texto / pílula | `#AACDFB` | `#182A45` | 8.82 | 4.5 | passa |
| info: texto / cartão | `#AACDFB` | `#141B14` | 10.73 | 4.5 | passa |
| info: texto-2 / aviso | `#C5CDC5` | `#182A45` | 8.87 | 4.5 | passa |
| info: sobre-sólido / sólido | `#0E141D` | `#97C1F7` | 9.93 | 4.5 | passa |
| info: borda do aviso / cartão | `#3963A1` | `#141B14` | 2.90 | — | info |

**Pares reprovados nos temas: 0.**

### Cargos (letra branca no círculo cheio)

| cargo | hoje | razão hoje | proposto (OKLCH) | hex | razão | anel vs cartão escuro |
|---|---|---:|---|---|---:|---:|
| coordenador | `#1D4ED8` | 6.70 | `oklch(42% 0.150 264)` | `#21459D` | 8.74  | 2.02 |
| lider_diurno | `#92400E` | 7.09 | `oklch(44% 0.075 50)` | `#73452B` | 8.03  | 2.20 |
| lider_noturno_geral | `#3730A3` | 9.93 | `oklch(39% 0.150 282)` | `#3D3291` | 10.18  | 1.73 |
| equipe_tecnica | `#6D28D9` | 7.10 | `oklch(47% 0.200 300)` | `#6F2FB7` | 7.59  | 2.32 |
| educador | `#047857` | 5.48 | `oklch(45% 0.080 182)` | `#006459` | 7.08  | 2.49 |
| enfermagem | `#0E7490` | 5.36 | `oklch(49% 0.090 222)` | `#026B85` | 6.10  | 2.89 |
| cozinha | `#9D174D` | 7.88 | `oklch(44% 0.150 355)` | `#8D2157` | 8.44  | 2.09 |
| portaria | `#4D5B0E` | 7.45 | `oklch(45% 0.090 120)` | `#4F5C1B` | 7.29  | 2.42 |
| gestor_geral | `#334155` | 10.35 | `oklch(38% 0.035 255)` | `#364355` | 10.04  | 1.76 |
| admin_tecnico | `#52525B` | 7.73 | `oklch(44% 0.012 285)` | `#525259` | 7.75  | 2.28 |

### Categorias do dia (borda de 5 px, mínimo 3 contra o cartão)

| categoria | hoje | razão hoje / branco | claro proposto | hex | razão | escuro proposto | hex | razão / cartão escuro |
|---|---|---:|---|---|---:|---|---|---:|
| saude | `#EC4899` | 3.53 | `oklch(60% 0.190 350)` | `#CD4290` | 4.40 | `oklch(72% 0.140 350)` | `#E57DB1` | 6.63 |
| medicamento | `#8B5CF6` | 4.23 | `oklch(56% 0.200 295)` | `#8151DB` | 5.08 | `oklch(70% 0.140 295)` | `#A58BEC` | 6.30 |
| educacao | `#3B82F6` | 3.68 | `oklch(56% 0.170 258)` | `#2A71D6` | 4.74 | `oklch(70% 0.120 258)` | `#6EA0E8` | 6.60 |
| lazer | `#10B981` | 2.54 **<3** | `oklch(58% 0.130 158)` | `#15915C` | 4.01 | `oklch(72% 0.120 160)` | `#57BC8A` | 7.53 |
| alimentacao | `#F59E0B` | 2.15 **<3** | `oklch(62% 0.139 65)` | `#BE7100` | 3.78 | `oklch(78% 0.130 75)` | `#E8AA4E` | 8.64 |
| saida | `#06B6D4` | 2.43 **<3** | `oklch(60% 0.106 215)` | `#0090A8` | 3.78 | `oklch(74% 0.100 215)` | `#54BBD2` | 7.91 |
| ocorrencia | `#EF4444` | 3.76 | `oklch(58% 0.200 27)` | `#D73431` | 4.75 | `oklch(70% 0.150 25)` | `#ED756E` | 6.19 |
| rotina | `#64748B` | 4.76 | `oklch(57% 0.030 255)` | `#6C7989` | 4.44 | `oklch(68% 0.025 255)` | `#8E99A8` | 6.11 |

### Azulejos do Colorido (desenho sobre o azulejo, mínimo 3 para ícone; medido contra 4,5)

| azulejo | fundo | tinta | razão |
|---|---|---|---:|
| framboesa | `oklch(94% 0.035 350)` `#FFE2EE` | `oklch(47% 0.150 350)` `#942D66` | 6.14 |
| azul | `oklch(94% 0.028 258)` `#E0ECFF` | `oklch(47% 0.160 262)` `#2454B3` | 5.88 |
| agua | `oklch(94% 0.040 200)` `#CDF4F6` | `oklch(48% 0.082 205)` `#006B74` | 5.33 |
| violeta | `oklch(94% 0.033 300)` `#EEE7FF` | `oklch(47% 0.200 300)` `#6F2FB7` | 6.33 |
| folha | `oklch(94% 0.050 140)` `#DAF4D4` | `oklch(47% 0.110 140)` `#36692A` | 5.57 |
| ceu | `oklch(94% 0.033 235)` `#D6EFFF` | `oklch(48% 0.100 235)` `#06658E` | 5.41 |

### As 48 cores da casa (barra e ponto: mínimo 3)

No claro, contra o fundo proposto e o branco: Limão 2.94, Pistache 2.93, Girassol 2.21, Milho 2.54, Mel 2.92, Laranja 2.84, Tangerina 2.94, Pêssego 2.86, Areia 2.99. Pior: 2.21.

No escuro, como estão hoje, contra o cartão escuro proposto: 11 de 48 abaixo de 3 (Uva 2.93, Violeta 2.94, Anil 2.76, Noite 2.13, Café 2.59, Chocolate 2.10, Ameixa 2.20, Vinho 2.19, Cereja 2.46, Grafite 2.87, Petróleo 2.62).

No escuro, clareadas com `oklch(from var(--cor) calc(l + 0.14) c h)`: todas passam; pior 3.81.

### O que existe hoje e não passa (para comparar)

| par | razão | mínimo |
|---|---:|---:|
| claro · borda de campo --line-2 #BDCBDC / campo --raised #F6F9FC | 1.56 | 3 |
| claro · borda de campo --line-2 #BDCBDC / cartão #FFFFFF | 1.65 | 3 |
| escuro · borda de campo --line-2 #3B4C5D / cartão #151E28 | 1.90 | 3 |
| escuro · letra #07121C / aba ativa e Acolhe+AI #7BC0EC (área grande, muito luminosa) | 9.52 | 4.5 |
| claro · --muted #566579 / --sunken #E3EAF3 | 4.90 | 4.5 |
| rs · azulejo vermelho #A6191F / #FCE3E1 | 6.19 | 4.5 |
| rs · azulejo amarelo #7A5B00 / #FFF1BF | 5.59 | 4.5 |

### Fora da gama sRGB (o hex leva o croma cortado; o OKLCH fica)

- claro.marca-hover: oklch(0.395 0.105 247) fora do sRGB, croma reduzido para 0.104 no hex
- claro.foco: oklch(0.54 0.15 245) fora do sRGB, croma reduzido para 0.136 no hex
- claro.crit-fundo: oklch(0.965 0.022 20) fora do sRGB, croma reduzido para 0.017 no hex
- claro.warn-fundo: oklch(0.972 0.04 85) fora do sRGB, croma reduzido para 0.030 no hex
- claro.ok-texto: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- claro.ok-solido: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- claro.info-fundo: oklch(0.963 0.02 255) fora do sRGB, croma reduzido para 0.018 no hex
- escuro.crit-texto: oklch(0.83 0.095 22) fora do sRGB, croma reduzido para 0.094 no hex
- rosa.crit-fundo: oklch(0.965 0.022 20) fora do sRGB, croma reduzido para 0.017 no hex
- rosa.warn-fundo: oklch(0.972 0.04 85) fora do sRGB, croma reduzido para 0.030 no hex
- rosa.ok-texto: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- rosa.ok-solido: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- rosa.info-fundo: oklch(0.963 0.02 255) fora do sRGB, croma reduzido para 0.018 no hex
- azul.texto: oklch(0.225 0.0455 230) fora do sRGB, croma reduzido para 0.045 no hex
- azul.titulo: oklch(0.38 0.085 232) fora do sRGB, croma reduzido para 0.078 no hex
- azul.marca: oklch(0.48 0.1 228) fora do sRGB, croma reduzido para 0.094 no hex
- azul.marca-forte: oklch(0.48 0.1 228) fora do sRGB, croma reduzido para 0.094 no hex
- azul.marca-hover: oklch(0.42 0.095 230) fora do sRGB, croma reduzido para 0.084 no hex
- azul.foco: oklch(0.56 0.12 228) fora do sRGB, croma reduzido para 0.109 no hex
- azul.crit-fundo: oklch(0.965 0.022 20) fora do sRGB, croma reduzido para 0.017 no hex
- azul.warn-fundo: oklch(0.972 0.04 85) fora do sRGB, croma reduzido para 0.030 no hex
- azul.ok-texto: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- azul.ok-solido: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- azul.info-fundo: oklch(0.963 0.02 255) fora do sRGB, croma reduzido para 0.018 no hex
- verde.crit-fundo: oklch(0.965 0.022 20) fora do sRGB, croma reduzido para 0.017 no hex
- verde.warn-fundo: oklch(0.972 0.04 85) fora do sRGB, croma reduzido para 0.030 no hex
- verde.ok-texto: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- verde.ok-solido: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- verde.info-fundo: oklch(0.963 0.02 255) fora do sRGB, croma reduzido para 0.018 no hex
- colorido.marca-suave: oklch(0.95 0.03 300) fora do sRGB, croma reduzido para 0.028 no hex
- colorido.crit-fundo: oklch(0.965 0.022 20) fora do sRGB, croma reduzido para 0.017 no hex
- colorido.warn-fundo: oklch(0.972 0.04 85) fora do sRGB, croma reduzido para 0.030 no hex
- colorido.ok-texto: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- colorido.ok-solido: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- colorido.info-fundo: oklch(0.963 0.02 255) fora do sRGB, croma reduzido para 0.018 no hex
- rs.marca-hover: oklch(0.395 0.115 148) fora do sRGB, croma reduzido para 0.115 no hex
- rs.crit-fundo: oklch(0.965 0.022 20) fora do sRGB, croma reduzido para 0.017 no hex
- rs.warn-fundo: oklch(0.972 0.04 85) fora do sRGB, croma reduzido para 0.030 no hex
- rs.ok-texto: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- rs.ok-solido: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- rs.info-fundo: oklch(0.963 0.02 255) fora do sRGB, croma reduzido para 0.018 no hex
- rosa-escuro.crit-texto: oklch(0.83 0.095 22) fora do sRGB, croma reduzido para 0.094 no hex
- azul-escuro.crit-texto: oklch(0.83 0.095 22) fora do sRGB, croma reduzido para 0.094 no hex
- verde-escuro.crit-texto: oklch(0.83 0.095 22) fora do sRGB, croma reduzido para 0.094 no hex
- colorido-escuro.foco: oklch(0.81 0.12 293) fora do sRGB, croma reduzido para 0.105 no hex
- colorido-escuro.crit-texto: oklch(0.83 0.095 22) fora do sRGB, croma reduzido para 0.094 no hex
- rs-escuro.crit-texto: oklch(0.83 0.095 22) fora do sRGB, croma reduzido para 0.094 no hex
- cargo.educador: oklch(0.45 0.085 182) fora do sRGB, croma reduzido para 0.081 no hex
- casa-clareada: oklch(0.724 0.178 28) fora do sRGB, croma reduzido para 0.171 no hex
- casa-clareada: oklch(0.77 0.174 346.6) fora do sRGB, croma reduzido para 0.169 no hex
- casa-clareada: oklch(0.812 0.152 58) fora do sRGB, croma reduzido para 0.128 no hex
- casa-clareada: oklch(0.806 0.16 48.4) fora do sRGB, croma reduzido para 0.121 no hex
- casa-clareada: oklch(0.811 0.134 42.4) fora do sRGB, croma reduzido para 0.113 no hex
- casa-clareada: oklch(0.792 0.141 28.9) fora do sRGB, croma reduzido para 0.120 no hex
- casa-clareada: oklch(0.788 0.162 30.2) fora do sRGB, croma reduzido para 0.123 no hex
- cat.alimentacao: oklch(0.62 0.14 65) fora do sRGB, croma reduzido para 0.139 no hex
- cat.saida: oklch(0.6 0.11 215) fora do sRGB, croma reduzido para 0.106 no hex
- : oklch(0.94 0.04 350) fora do sRGB, croma reduzido para 0.036 no hex
- : oklch(0.94 0.035 258) fora do sRGB, croma reduzido para 0.029 no hex
- : oklch(0.48 0.09 205) fora do sRGB, croma reduzido para 0.082 no hex
- : oklch(0.94 0.04 300) fora do sRGB, croma reduzido para 0.034 no hex
- : oklch(0.94 0.035 235) fora do sRGB, croma reduzido para 0.034 no hex
