# Which flag and which name a country has at the 1836 start. The game picks both by running triggers
# ("a monarchy whose primary culture is Manchu is the Great Qing"; "an absolute monarchy flies the
# imperial flag"), so this runs the same triggers against what we know of a country at the start:
# its tag, its laws and its cultures. Anything it can't judge (a variable, a ruler's ideology, a
# government type that only exists later) counts as "not true", which for 1836 is the right way.
require_relative "vic3_script"

class CoaRules
  Facts = Struct.new(:tag, :laws, :cultures, keyword_init: true)

  def initialize(game, existing_tags)
    @existing = existing_tags
    @triggers = {}
    Dir[game.join("common/scripted_triggers/*.txt").to_s].sort.each do |f|
      Vic3Script.parse(File.read(f)).each { |k, _, v| @triggers[k] = v if k && v.is_a?(Array) }
    end
    @lists = {}
    Dir[game.join("common/flag_definitions/*.txt").to_s].sort.each do |f|
      Vic3Script.parse(File.read(f)).each { |k, _, v| @lists[k] = v if k && v.is_a?(Array) && !k.start_with?("@") }
    end
    @names = Hash.new { |h, k| h[k] = [] }
    Dir[game.join("common/dynamic_country_names/*.txt").to_s].sort.each do |f|
      Vic3Script.parse(File.read(f)).each do |tag, _, body|
        next unless tag && body.is_a?(Array)

        Vic3Script.values(body, "dynamic_country_name").each { |d| @names[tag] << d if d.is_a?(Array) }
      end
    end
  end

  # The coat-of-arms key this country flies: the valid flag definition with the highest priority.
  def flag_coa(facts, known)
    best = nil
    definitions(facts.tag).each do |d|
      coa = Vic3Script.value(d, "coa")
      next unless coa.is_a?(String) && coa != "list" && known.include?(coa)

      trigger = Vic3Script.value(d, "trigger")
      next unless trigger.nil? || holds?(trigger, facts) == true

      priority = Vic3Script.value(d, "priority").to_f
      best = [priority, coa] if best.nil? || priority > best.first
    end
    best ? best.last : facts.tag
  end

  # [name key, adjective key] of the dynamic name that applies, or nil: the plain name stays.
  def dynamic_name(facts)
    best = nil
    @names[facts.tag].each do |d|
      trigger = Vic3Script.value(d, "trigger")
      next unless trigger.nil? || holds?(trigger, facts) == true

      priority = Vic3Script.value(d, "priority").to_f
      best = [priority, Vic3Script.value(d, "name"), Vic3Script.value(d, "adjective")] if best.nil? || priority > best.first
    end
    best && best[1] ? [ best[1], best[2] ] : nil
  end

  private

  # The flag definitions of a tag's own list (and any lists it includes) and of DEFAULT.
  def definitions(tag, seen = [])
    out = []
    [ tag, "DEFAULT" ].each do |name|
      list = @lists[name]
      next if list.nil? || seen.include?(name)

      Vic3Script.values(list, "includes").each { |inc| out.concat(definitions(inc, seen + [ name ])) if inc.is_a?(String) }
      out.concat(Vic3Script.values(list, "flag_definition").select { |d| d.is_a?(Array) })
    end
    out
  end

  # true / false / nil (can't tell). A block is an AND of its entries.
  def holds?(block, facts)
    results = block.reject { |k, _, _| k.nil? }.map { |k, op, v| entry(k, op, v, facts) }
    return false if results.include?(false)

    results.include?(nil) ? nil : true
  end

  def any?(block, facts)
    results = block.reject { |k, _, _| k.nil? }.map { |k, op, v| entry(k, op, v, facts) }
    return true if results.include?(true)

    results.include?(nil) ? nil : false
  end

  def entry(key, _op, value, facts)
    case key
    when "OR" then any?(value, facts)
    when "AND" then holds?(value, facts)
    when "NOT", "NOR" then (r = any?(value, facts)).nil? ? nil : !r
    when "always" then value == "yes"
    when "has_law", "has_law_or_variant" then facts.laws.include?(value.to_s.delete_prefix("law_type:"))
    when "country_has_primary_culture" then facts.cultures.include?(value.to_s.delete_prefix("cu:"))
    when "exists" then value == "scope:actor" ? true : (value.to_s.start_with?("c:") ? @existing.include?(value.delete_prefix("c:")) : nil)
    when "scope:actor" then value.is_a?(Array) ? holds?(value, facts) : nil
    when "is_subject", "is_secessionist", "is_revolutionary", "is_revolutionary_or_secessionist", "has_variable", "is_subject_type" then value == "no"
    when /\Ac:(\w+)\z/ then value == "this" ? facts.tag == $1 : nil
    else
      if @triggers.key?(key) && %w[yes no].include?(value)
        r = holds?(@triggers[key], facts)
        r.nil? || value == "yes" ? r : !r
      end
    end
  end
end
