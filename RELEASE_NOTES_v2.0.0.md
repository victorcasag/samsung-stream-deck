# Release Notes v2.0.0 - Samsung SmartThings Stream Deck Plugin

## 🎉 Novidades Principais

### 📱 Identificação Automática de Tipos de Dispositivos
Agora quando você listar seus dispositivos, cada um aparece com um ícone identificando seu tipo:
- ❄️ **AC** - Ar Condicionado
- 💡 **Light** - Lâmpadas/Luzes
- 🔌 **Switch** - Interruptores
- 🚪 **Garage** - Portões de Garagem
- 📺 **TV** - Televisão
- ⚙️ **Device** - Outros dispositivos

### ❄️ Controles Avançados para Ar Condicionado
8 novos botões específicos para controle completo do seu ar condicionado Samsung:

#### **AC Power** - Liga/Desliga
- Liga e desliga o ar condicionado
- Mostra modo atual e temperatura quando ligado

#### **AC Mode** - Modo de Operação
- Alterna entre os modos: Cool → Heat → Fan → Dry → Auto
- Ideal para mudanças rápidas de modo

#### **AC Temp Up / AC Temp Down** - Controle de Temperatura
- Aumenta ou diminui a temperatura em 1°C
- Faixa de operação: 16°C a 30°C
- Mostra a temperatura atual no botão

#### **AC Fan Mode** - Velocidade do Ventilador
- Alterna entre: Auto → Low → Medium → High → Turbo
- Controle preciso da velocidade do ar

#### **AC Swing Vertical** - Oscilação Vertical
- Liga/desliga o movimento vertical das aletas
- Alterna entre Fixed e Vertical

#### **AC Swing Horizontal** - Oscilação Horizontal
- Liga/desliga o movimento horizontal das aletas
- Para modelos compatíveis

#### **AC WindFree** - Modo WindFree Samsung
- Ativa/desativa o modo WindFree exclusivo da Samsung
- Alterna entre Normal e WindFree

## 🔧 Melhorias Técnicas

- **Polling Inteligente**: Atualização automática a cada 5 segundos
- **Polling Agressivo**: Atualização rápida (0.5s) por 10 segundos após pressionar botão
- **Detecção de Dispositivos Offline**: Mostra alerta quando dispositivo não está disponível
- **Arquitetura Modular**: Classes específicas para cada tipo de dispositivo

## 📦 Arquivos da Release

### Para Download:
- `com.thibautsabot.streamdeck.smartthings.streamDeckPlugin` (106 KB)

### Como Instalar:
1. Baixe o arquivo `.streamDeckPlugin`
2. Dê duplo clique no arquivo
3. O Stream Deck irá instalar automaticamente
4. Configure seu token SmartThings nas configurações

## 🔄 Atualizando da v1.0.0

Se você já tem a versão anterior instalada:
1. Desinstale a versão antiga (opcional, mas recomendado)
2. Instale a nova versão v2.0.0
3. Suas configurações existentes serão preservadas

## 🐛 Correções de Bugs

- Melhoria na detecção de tipos de dispositivos
- Tratamento aprimorado de erros de rede
- Correção de problemas com dispositivos offline

## 📝 Notas Adicionais

- **Compatibilidade**: Stream Deck Software 4.1 ou superior
- **Plataformas**: Windows 10+ e macOS 10.11+
- **SmartThings API**: Requer token de acesso válido

## 🙏 Créditos

Desenvolvido com base no plugin original de Thibaut Sabot
Melhorias e recursos avançados de AC por Victor Casa Grande

---

**Versão**: 2.0.0
**Data**: 11 de Dezembro de 2024
**Licença**: MIT
