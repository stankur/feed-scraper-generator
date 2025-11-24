import asyncio
import sys
import os
import json
import logging
from datetime import datetime
from contextlib import contextmanager
from browser_use import Agent, Browser, ChatAnthropic
from dotenv import load_dotenv
from discover_shared import SonnetTieredCostTracker, monitor_costs, get_discovery_task

load_dotenv()

@contextmanager
def redirect_logs_to_file(log_file_path):
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    
    log_file = open(log_file_path, 'w')
    sys.stdout = log_file
    sys.stderr = log_file
    
    file_handler = logging.FileHandler(log_file_path)
    file_handler.setFormatter(logging.Formatter('%(message)s'))
    logging.root.addHandler(file_handler)
    
    try:
        yield log_file
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr
        logging.root.removeHandler(file_handler)
        log_file.close()

async def discover_single_company(company, index, total, cost_limit):
    start_time = datetime.now()
    log_dir = f"logs/{company.lower().replace(' ', '_')}_url_search"
    os.makedirs(log_dir, exist_ok=True)
    log_file = f"{log_dir}/run.log"
    
    print(f"[{index}/{total}] 🚀 {company}...", file=sys.__stdout__, flush=True)
    
    with redirect_logs_to_file(log_file):
        llm = ChatAnthropic(model="claude-sonnet-4-5", temperature=0)
        
        browser = Browser(
            headless=False,
            keep_alive=False,
        )
        
        task = get_discovery_task(company)
        
        agent = Agent(
            task=task,
            llm=llm,
            browser=browser,
            calculate_cost=True,
            save_conversation_path=f"{log_dir}/conversation.json",
        )
        
        cost_tracker = SonnetTieredCostTracker()
        
        agent_task = asyncio.create_task(agent.run(max_steps=30))
        monitor_task = asyncio.create_task(monitor_costs(agent, cost_tracker, cost_limit, agent_task))
        
        cost_limit_exceeded = False
        try:
            history = await agent_task
        except asyncio.CancelledError:
            cost_limit_exceeded = True
            history = agent.history
        finally:
            monitor_task.cancel()
            try:
                await monitor_task
            except asyncio.CancelledError:
                pass
        
        duration = (datetime.now() - start_time).total_seconds()
        
        urls = []
        error = None
        success = False
        
        if cost_limit_exceeded:
            error = "Cost limit exceeded"
        elif history.is_done():
            result = history.final_result()
            if result:
                try:
                    if isinstance(result, str):
                        parsed = json.loads(result)
                    else:
                        parsed = result
                    urls = parsed.get('urls', [])
                    success = True
                except (json.JSONDecodeError, TypeError):
                    error = "Failed to parse JSON result"
            else:
                error = "No result returned"
        else:
            error = "Agent did not complete successfully"
        
        result = {
            'company': company,
            'success': success,
            'cost': cost_tracker.total_cost,
            'duration': duration,
            'steps': history.number_of_steps(),
            'urls': urls,
            'timestamp': datetime.now().isoformat(),
        }
        
        if error:
            result['error'] = error
        
        with open(f"{log_dir}/run.json", 'w') as f:
            json.dump(result, f, indent=2)
        
        return result

url_lock = asyncio.Lock()

async def update_urls_json(company, result):
    async with url_lock:
        data = {}
        if os.path.exists('urls.json'):
            with open('urls.json') as f:
                data = json.load(f)
        
        data[company.lower()] = {
            'urls': result['urls'],
            'cost': result['cost'],
            'timestamp': result['timestamp'],
            'success': result['success']
        }
        
        if 'error' in result:
            data[company.lower()]['error'] = result['error']
        
        with open('urls.json', 'w') as f:
            json.dump(data, f, indent=2)

def load_processed_companies():
    if os.path.exists('urls.json'):
        with open('urls.json') as f:
            data = json.load(f)
            # Only skip if successful
            return {k.lower() for k, v in data.items() if v.get('success', False)}
    return set()

async def batch_discover_urls(companies_file, concurrency=3, per_company_limit=0.50, force=False):
    with open(companies_file) as f:
        all_companies = json.load(f)
    
    processed = set() if force else load_processed_companies()
    companies = [c for c in all_companies if c.lower() not in processed]
    
    if len(companies) < len(all_companies):
        skipped = len(all_companies) - len(companies)
        print(f"Skipping {skipped} already processed companies", file=sys.__stdout__)
    
    if not companies:
        print("No companies to process", file=sys.__stdout__)
        return
    
    print(f"Processing {len(companies)} companies (concurrency: {concurrency})\n", file=sys.__stdout__)
    
    semaphore = asyncio.Semaphore(concurrency)
    completed = 0
    
    async def process_with_semaphore(company, index):
        nonlocal completed
        async with semaphore:
            result = await discover_single_company(company, index, len(companies), per_company_limit)
            
            if result['success']:
                print(f"[{index}/{len(companies)}] ✅ {company} "
                      f"(${result['cost']:.2f}, {result['duration']:.1f}s) "
                      f"- {len(result['urls'])} URLs", file=sys.__stdout__, flush=True)
            else:
                error_msg = result.get('error', 'Unknown error')
                print(f"[{index}/{len(companies)}] ❌ {company} "
                      f"(${result['cost']:.2f}) - {error_msg}", file=sys.__stdout__, flush=True)
            
            await update_urls_json(company, result)
            completed += 1
            return result
    
    tasks = [process_with_semaphore(c, i+1) for i, c in enumerate(companies)]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    successful = sum(1 for r in results if isinstance(r, dict) and r.get('success'))
    failed = len(results) - successful
    total_cost = sum(r.get('cost', 0) for r in results if isinstance(r, dict))
    total_time = sum(r.get('duration', 0) for r in results if isinstance(r, dict))
    
    print("\n" + "="*60, file=sys.__stdout__)
    print(f"✓ Batch complete: {successful} succeeded, {failed} failed", file=sys.__stdout__)
    print(f"💰 Total cost: ${total_cost:.2f}", file=sys.__stdout__)
    print(f"⏱️  Total time: {total_time:.1f}s", file=sys.__stdout__)
    print("="*60, file=sys.__stdout__)
    
    if failed > 0:
        print("\nFailed jobs:", file=sys.__stdout__)
        for r in results:
            if isinstance(r, dict) and not r.get('success'):
                error = r.get('error', 'Unknown')
                print(f"  - {r['company']}: {error}", file=sys.__stdout__)

async def main():
    args = sys.argv[1:]
    
    if not args or args[0] in ['-h', '--help']:
        print("Usage: python discover-batch.py <companies.json> [--concurrency N] [--force]")
        sys.exit(1)
    
    companies_file = args[0]
    
    concurrency = 3
    if '--concurrency' in args:
        idx = args.index('--concurrency')
        if idx + 1 < len(args):
            concurrency = int(args[idx + 1])
    
    force = '--force' in args
    
    os.makedirs("logs", exist_ok=True)
    await batch_discover_urls(companies_file, concurrency=concurrency, force=force)

if __name__ == "__main__":
    asyncio.run(main())

