import { PoolClient } from "pg";
import { validate } from "uuid";

export const updateBalance = async(client: PoolClient, acc_id: string, user_id: string, amount: number) => {
  try {
    if(!validate(acc_id) || !validate(user_id)) return false;
    
    const query = `UPDATE accounts SET acc_balance = acc_balance + $1 WHERE user_id = $2 AND acc_id = $3 RETURNING *;`
    const result = await client.query(query, [amount, user_id, acc_id]);

    if(result.rows.length === 0) return false;
    return result;
  } catch (error) {
    console.error(error);
    return false;
  }
}

// Applies a transaction to its account's balance (or reverts it with revert = true).
export const applyToBalance = async (
  client: PoolClient,
  acc_id: string,
  user_id: string,
  tran_type: string,
  tran_amount: number | string,
  revert = false,
) => {
  const account = await lockAccount(client, acc_id, user_id);
  if (!account) return "not_found" as const;

  const isCredit = (tran_type === "income") !== revert;
  const delta = Number(tran_amount) * (isCredit ? 1 : -1);
  const { acc_type, acc_balance } = account.rows[0];

  if (delta < 0 && ["cash", "current", "saving"].includes(acc_type) && -delta > Number(acc_balance)) {
    return "insufficient" as const;
  }

  return (await updateBalance(client, acc_id, user_id, delta)) ? ("ok" as const) : ("not_found" as const);
};

export const lockAccount = async(client: PoolClient, acc_id: string, user_id: string) => {
  try {
    if (!validate(user_id) || !validate(acc_id)) return false;

    const query =  "SELECT * FROM accounts WHERE user_id = $1 AND acc_id = $2 FOR UPDATE;"
    const result = await client.query(query, [user_id, acc_id]);

    return result.rows.length === 0 ? null : result;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export const lockTransaction = async(client: PoolClient, tran_id: string, user_id: string) => {
  try {
    if (!validate(user_id) || !validate(tran_id)) return null;

    const query = "SELECT * FROM transactions WHERE user_id = $1 AND tran_id = $2 AND deleted_at IS NULL FOR UPDATE;"
    const result = await client.query(query, [user_id, tran_id]);

    return result.rows.length === 0 ? null : result;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export const balanceErrors = {
  not_found: { status: 404, msg: "Account doesn't exist or doesn't belong to this user." },
  insufficient: { status: 422, msg: "Transaction amount is greater than account balance, it can not be processed." },
} as const;