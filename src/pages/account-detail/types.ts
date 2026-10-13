// 账户相关共享类型（Console / AccountDetail / 子组件共用）
export interface Account {
  id: number;
  bot_name: string;
  steam_username: string;
  status: string;
  server_name: string | null;
  server_id: number | null;
  expires_at: string | null;
  created_at?: string;
  display_name?: string | null;
}

export interface FarmGame {
  AppID?: number;
  CardsRemaining?: number;
  GameName?: string;
  TimeRemaining?: string;
}

export interface BotObj {
  BotName?: string;
  IsConnectedAndLoggedOn?: boolean;
  RequiredInput?: number;
  KeepRunning?: boolean;
  Nickname?: string | null;
  SteamID?: string;
  WalletBalance?: number;
  WalletCurrency?: number;
  CardsFarmer?: {
    CurrentGamesFarming?: FarmGame[];
    GamesToFarm?: FarmGame[];
    TimeRemaining?: string;
    NowFarming?: boolean;
    Paused?: boolean;
  };
}

export interface PlaySession {
  id: number;
  account_id: number;
  bot_name: string;
  server_id: number;
  app_ids: number[];
  online_status: number;
  display_name: string | null;
  started_at: string;
  status: string;
}

export type ModeKey = "farm" | "play";
export type TabKey = "recommend" | "all" | "done";
